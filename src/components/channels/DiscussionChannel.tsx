"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { readCachedValue, writeCachedValue } from "@/lib/client-cache";

type DiscussionMessageRow = {
  id: string;
  body: string | null;
  created_at: string;
  author_id: string | null;
  profiles: { username: string | null; avatar_url: string | null } | { username: string | null; avatar_url: string | null }[] | null;
};

type DiscussionMessage = {
  id: string;
  author: string;
  avatarUrl: string | null;
  sentAt: string;
  isCurrentUser: boolean;
  text: string;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function MessageAvatar({ author, avatarUrl }: { author: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={`${author} avatar`}
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-full border border-white/30 object-cover shadow-sm"
      />
    );
  }

  return (
    <span className="relative z-20 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-bg text-[0.68rem] font-semibold text-text/90 shadow-sm">
      {getInitials(author)}
    </span>
  );
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function normalizeMessage(row: DiscussionMessageRow, currentUserId: string | null): DiscussionMessage {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const author = profile?.username?.trim() || "Member";

  return {
    id: row.id,
    author,
    avatarUrl: profile?.avatar_url ?? null,
    sentAt: formatTime(row.created_at),
    isCurrentUser: Boolean(currentUserId && row.author_id === currentUserId),
    text: row.body?.trim() || "",
  };
}


function upsertMessage(next: DiscussionMessage, list: DiscussionMessage[]) {
  const filtered = list.filter((item) => !(item.id === next.id || (next.isCurrentUser && item.text === next.text && item.sentAt === "sending...")));
  return [...filtered, next];
}

const MESSAGE_CACHE_TTL_MS = 1000 * 60 * 5;

function getMessageCacheKey(targetChannelId: string) {
  return `bareunity:discussion:${targetChannelId}:messages`;
}

export default function DiscussionChannel({ channelId, newcomerModeration = false }: { channelId: string; newcomerModeration?: boolean }) {
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("newcomer");
  const [status, setStatus] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const cachedMessages = useMemo(
    () => readCachedValue<DiscussionMessage[]>(getMessageCacheKey(channelId), MESSAGE_CACHE_TTL_MS) ?? [],
    [channelId],
  );

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted) return;
      const authUser = data.user ?? null;
      setCurrentUserId(authUser?.id ?? null);
      setCurrentUserAvatarUrl((authUser?.user_metadata?.avatar_url as string | undefined) ?? null);
      currentUserIdRef.current = authUser?.id ?? null;

      if (authUser?.id) {
        const { data: settingsData } = await supabase.from("profile_settings").select("user_role").eq("user_id", authUser.id).maybeSingle<{ user_role: string | null }>();
        if (isMounted) setCurrentUserRole(settingsData?.user_role ?? "newcomer");
      }
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
      setCurrentUserAvatarUrl((session?.user?.user_metadata?.avatar_url as string | undefined) ?? null);
      setCurrentUserRole((session?.user?.user_metadata?.role as string | undefined) ?? "newcomer");
      currentUserIdRef.current = session?.user?.id ?? null;
    });

    return () => {
      isMounted = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadMessages() {
      setLoading(cachedMessages.length === 0);
      const { data, error } = await supabase
        .from("channel_messages")
        .select("id, body, created_at, author_id, profiles!channel_messages_author_id_fkey(username, avatar_url)")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(150);

      if (!isMounted) return;

      if (error) {
        console.error(error);
        setStatus("Could not load messages.");
      } else {
        const normalized = ((data ?? []) as DiscussionMessageRow[])
          .map((row) => normalizeMessage(row, currentUserId))
          .filter((message) => message.text.length > 0);
        setMessages(normalized);
        writeCachedValue(getMessageCacheKey(channelId), normalized);
        setStatus(null);
      }

      setLoading(false);
    }

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [cachedMessages.length, channelId, currentUserId]);

  useEffect(() => {
    if (!messages.length) return;
    writeCachedValue(getMessageCacheKey(channelId), messages);
  }, [channelId, messages]);

  useEffect(() => {
    const realtimeChannel = supabase
      .channel(`discussion-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "channel_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; body?: string | null; created_at?: string; author_id?: string | null };
          if (!row.id || !row.created_at) return;

          const message: DiscussionMessage = {
            id: row.id,
            text: row.body?.trim() || "",
            sentAt: formatTime(row.created_at),
            isCurrentUser: Boolean(currentUserIdRef.current && row.author_id === currentUserIdRef.current),
            author: currentUserIdRef.current && row.author_id === currentUserIdRef.current ? "You" : "Member",
            avatarUrl: currentUserIdRef.current && row.author_id === currentUserIdRef.current ? currentUserAvatarUrl : null,
          };

          if (!message.text) return;

          setMessages((prev) => upsertMessage(message, prev));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [channelId, currentUserAvatarUrl]);

  const displayMessages = messages.length > 0 ? messages : cachedMessages;
  const isLoadingMessages = loading && displayMessages.length === 0;
  const participantPreview = useMemo(() => {
    const byAuthor = new Map<string, { author: string; avatarUrl: string | null }>();
    displayMessages.forEach((message) => {
      if (!byAuthor.has(message.author)) {
        byAuthor.set(message.author, { author: message.author, avatarUrl: message.avatarUrl });
      }
    });
    return Array.from(byAuthor.values()).slice(0, 6);
  }, [displayMessages]);
  const threadFocusStart = useMemo(() => (displayMessages.length > 6 ? Math.max(1, displayMessages.length - 5) : -1), [displayMessages.length]);

  const strictModerationEnabled = newcomerModeration && currentUserRole === "newcomer";
  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;

    if (strictModerationEnabled) {
      if (trimmed.length > 280) {
        setStatus("Newcomer channels allow up to 280 characters per message.");
        return;
      }
      if (/https?:\/\//i.test(trimmed) || /www\./i.test(trimmed)) {
        setStatus("Links are disabled in newcomer channels by default.");
        return;
      }
    }

    const optimisticId = `tmp-${Date.now()}`;
    const optimisticMessage: DiscussionMessage = {
      id: optimisticId,
      author: "You",
      avatarUrl: currentUserAvatarUrl,
      sentAt: "sending...",
      isCurrentUser: true,
      text: trimmed,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setDraft("");
    setStatus(null);

    if (!currentUserId) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
      setStatus("Sign in to send a message.");
      return;
    }

    const { data, error } = await supabase
      .from("channel_messages")
      .insert({
        channel_id: channelId,
        author_id: currentUserId,
        body: trimmed,
      })
      .select("id, body, created_at, author_id")
      .single();

    if (error || !data) {
      console.error(error);
      setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
      setStatus("Message failed to send.");
      return;
    }

    const confirmedMessage: DiscussionMessage = {
      id: data.id,
      author: "You",
      avatarUrl: currentUserAvatarUrl,
      sentAt: formatTime(data.created_at),
      isCurrentUser: true,
      text: data.body?.trim() || "",
    };

    if (!confirmedMessage.text) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
      return;
    }

    setMessages((prev) => upsertMessage(confirmedMessage, prev));
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-white/15 bg-linear-to-br from-[#0f1a32] via-[#121f39] to-[#1b2942]">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
        <h2 className="text-[1.05rem] font-semibold text-white/90">Combined Mockup — Bubble Chat + Thread Highlight</h2>
        <span className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-white/80">messages area concept</span>
      </div>

      <div className="grid min-h-160 grid-cols-[250px_minmax(0,1fr)_300px]">
        <aside className="border-r border-white/10 p-3">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={`left-nav-${index}`} className="h-12 rounded-xl border border-white/12 bg-white/3" />
            ))}
          </div>
        </aside>

        <div className="flex flex-col border-r border-white/10">
          <div className="relative flex-1 overflow-y-auto px-4 py-5">
            {isLoadingMessages ? (
              <p className="text-sm text-white/60">Loading discussion…</p>
            ) : displayMessages.length === 0 ? (
              <p className="text-sm text-white/60">No messages yet. Start the conversation.</p>
            ) : (
              displayMessages.map((message, index) => {
                const isRight = message.isCurrentUser;
                const isFocusedThreadMessage = !isRight && threadFocusStart >= 0 && index >= threadFocusStart;
                const pillWidth = Math.min(96, Math.max(28, Math.round(message.text.length * 0.9)));

                return (
                  <article key={message.id} className={`relative mb-3 flex ${isRight ? "justify-end" : "justify-start"}`}>
                    {isFocusedThreadMessage ? <span className="absolute left-8 top-3 h-18 w-0.5 rounded-full bg-indigo-400/70" /> : null}

                    <div className={`relative z-10 flex items-center gap-3 ${isRight ? "flex-row-reverse" : "flex-row"}`}>
                      <MessageAvatar author={message.author} avatarUrl={message.avatarUrl} />
                      <div
                        className={`h-12 rounded-2xl border ${
                          isRight
                            ? "border-indigo-400/40 bg-indigo-500/35"
                            : "border-white/15 bg-white/5"
                        }`}
                        style={{ width: `${pillWidth}px` }}
                        title={message.text}
                      />
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={1000}
              className="h-11 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-white/50 focus:border-indigo-400/60"
              placeholder="Type your message"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="h-11 rounded-xl bg-indigo-500 px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

        <aside className="space-y-3 p-4">
          <div>
            <h3 className="mb-2 text-sm text-white/85">Active Thread</h3>
            <div className="rounded-xl border border-white/12 bg-white/4 p-3">
              <div className="mb-2 flex gap-2">
                <span className="rounded-full bg-indigo-500/35 px-2.5 py-1 text-[11px] text-indigo-100">Thread</span>
                <span className="rounded-full bg-indigo-500/35 px-2.5 py-1 text-[11px] text-indigo-100">Design</span>
              </div>
              <div className="mb-2 h-2 w-full rounded-full bg-white/30" />
              <div className="h-2 w-4/5 rounded-full bg-white/30" />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm text-white/85">Participants</h3>
            <div className="rounded-xl border border-white/12 bg-white/4 p-3">
              {(participantPreview.length ? participantPreview : [{ author: "", avatarUrl: null }, { author: "", avatarUrl: null }, { author: "", avatarUrl: null }])
                .slice(0, 3)
                .map((participant, idx) => (
                  <div key={`${participant.author || "placeholder"}-${idx}`} className="mb-2 flex items-center gap-2 last:mb-0">
                    {participant.author ? <MessageAvatar author={participant.author} avatarUrl={participant.avatarUrl} /> : <span className="h-8 w-8 rounded-full bg-white/20" />}
                    <div className="h-2 w-32 rounded-full bg-white/30" />
                  </div>
                ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm text-white/85">Pinned</h3>
            <div className="rounded-xl border border-white/12 bg-white/4 p-3">
              <div className="mb-2 h-2 w-11/12 rounded-full bg-white/30" />
              <div className="h-2 w-3/4 rounded-full bg-white/30" />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm text-white/85">Attachments</h3>
            <div className="rounded-xl border border-white/12 bg-white/4 p-3">
              <div className="mb-2 h-2 w-4/5 rounded-full bg-white/30" />
              <div className="h-2 w-2/3 rounded-full bg-white/30" />
            </div>
          </div>
        </aside>
      </div>

      {status ? <p className="px-4 pb-3 text-xs text-amber-200">{status}</p> : null}
    </section>
  );
}
