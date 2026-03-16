"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { readCachedValue, writeCachedValue } from "@/lib/client-cache";
import { supabase } from "@/lib/supabase";

type DiscussionMessageRow = {
  id: string;
  body: string | null;
  created_at: string;
  author_id: string | null;
  profiles:
    | { username: string | null; avatar_url: string | null }
    | { username: string | null; avatar_url: string | null }[]
    | null;
};

type DiscussionMessage = {
  id: string;
  author: string;
  avatarUrl: string | null;
  sentAt: string;
  isCurrentUser: boolean;
  text: string;
};

const MESSAGE_CACHE_TTL_MS = 1000 * 60 * 5;

function getMessageCacheKey(targetChannelId: string) {
  return `bareunity:discussion:${targetChannelId}:messages`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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

function MessageAvatar({ author, avatarUrl }: { author: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={`${author} avatar`}
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-full border border-accent/35 object-cover"
      />
    );
  }

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/35 bg-bg text-[0.65rem] font-semibold text-text/90">
      {getInitials(author)}
    </span>
  );
}

export default function DiscussionPage() {
  const channelSlug = "discussion";
  const newcomerModeration = false;

  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("newcomer");
  const [status, setStatus] = useState<string | null>(null);

  const currentUserIdRef = useRef<string | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [channelId, setChannelId] = useState<string>(channelSlug);

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
        const { data: settingsData } = await supabase
          .from("profile_settings")
          .select("user_role")
          .eq("user_id", authUser.id)
          .maybeSingle<{ user_role: string | null }>();
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
        const { data: channelData } = await supabase
        .from("channels")
        .select("id")
        .eq("slug", channelSlug)
        .maybeSingle<{ id: string }>();

      const resolvedChannelId = channelData?.id ?? channelSlug;
      setChannelId(resolvedChannelId);
      setLoading(cachedMessages.length === 0);

      const { data, error } = await supabase
        .from("channel_messages")
        .select("id, body, created_at, author_id, profiles!channel_messages_author_id_fkey(username, avatar_url)")
        .eq("channel_id", resolvedChannelId)
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
          const row = payload.new as {
            id?: string;
            body?: string | null;
            created_at?: string;
            author_id?: string | null;
          };
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

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const displayMessages = messages.length > 0 ? messages : cachedMessages;
  const isLoadingMessages = loading && displayMessages.length === 0;
  const strictModerationEnabled = newcomerModeration && currentUserRole === "newcomer";
  const canSend = draft.trim().length > 0;

  const onlineUsers = useMemo(() => {
    const byName = new Map<string, { author: string; avatarUrl: string | null }>();
    displayMessages.forEach((message) => {
      if (!byName.has(message.author)) {
        byName.set(message.author, { author: message.author, avatarUrl: message.avatarUrl });
      }
    });
    return Array.from(byName.values()).slice(0, 8);
  }, [displayMessages]);

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
    <section className="h-full p-4 sm:p-6">
      <div className="grid min-h-[calc(100vh-6rem)] grid-cols-1 overflow-hidden rounded-2xl border border-accent/20 bg-bg-deep lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-0 flex-col lg:border-r lg:border-accent/20">
          <header className="flex h-14 items-center border-b border-accent/20 px-4 sm:px-6">
            <h1 className="text-base font-bold text-text"># discussion</h1>
            <span className="ml-2 text-xs text-muted">community chat</span>
          </header>

          <div ref={feedRef} className="flex-1 space-y-1 overflow-y-auto bg-linear-to-b from-bg-deep to-card/20 px-3 py-4 sm:px-5">
            {isLoadingMessages ? <p className="px-1 text-sm text-muted">Loading messages…</p> : null}
            {!isLoadingMessages && displayMessages.length === 0 ? <p className="px-1 text-sm text-muted">No messages yet. Start the conversation.</p> : null}

            {displayMessages.map((message) => (
              <article key={message.id} className="group flex gap-3 rounded-lg px-2 py-2 hover:bg-card/35">
                <MessageAvatar author={message.author} avatarUrl={message.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className={`text-[0.95rem] font-semibold ${message.isCurrentUser ? "text-accent" : "text-text"}`}>{message.author}</p>
                    <span className="text-[11px] text-muted">{message.sentAt}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-6 text-text/95">{message.text}</p>
                </div>
              </article>
            ))}
          </div>

          <form onSubmit={handleSend} className="border-t border-accent/20 bg-card/10 p-3 sm:p-4">
            <div className="flex items-center gap-2 rounded-xl border border-accent/20 bg-card/40 px-2 py-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bg text-text/80">+</span>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={1000}
                className="h-9 w-full flex-1 bg-transparent px-2 text-sm text-text outline-none placeholder:text-text/50"
                placeholder="Message #discussion"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="h-9 rounded-lg bg-accent px-4 text-xs font-semibold text-text disabled:cursor-not-allowed disabled:opacity-45"
              >
                Send
              </button>
            </div>
          </form>
        </div>

        <aside className="hidden bg-bg p-4 lg:block">
          <div className="mb-3 rounded-xl border border-accent/20 bg-card/30 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text/90">Room</h2>
            <p className="mt-2 text-xs leading-5 text-muted">General discussion channel for updates, help, and day-to-day conversation.</p>
          </div>

          <div className="rounded-xl border border-accent/20 bg-card/30 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text/90">Online — {onlineUsers.length}</h2>
            <div className="space-y-2">
              {(onlineUsers.length ? onlineUsers : [{ author: "No active users yet", avatarUrl: null }]).map((member, index) => (
                <div key={`${member.author}-${index}`} className="flex items-center gap-2">
                  {member.avatarUrl || member.author !== "No active users yet" ? (
                    <MessageAvatar author={member.author} avatarUrl={member.avatarUrl} />
                  ) : (
                    <span className="h-9 w-9 rounded-full border border-accent/20 bg-card/40" />
                  )}
                  <p className="truncate text-sm text-text/90">{member.author}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {status ? <p className="mt-3 text-xs text-accent/90">{status}</p> : null}
    </section>
  );
}