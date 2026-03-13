"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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

export default function DiscussionChannel({ channelId }: { channelId: string }) {
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setCurrentUserId(data.user?.id ?? null);
      setCurrentUserAvatarUrl((data.user?.user_metadata?.avatar_url as string | undefined) ?? null);
      currentUserIdRef.current = data.user?.id ?? null;
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
      setCurrentUserAvatarUrl((session?.user?.user_metadata?.avatar_url as string | undefined) ?? null);
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
      setLoading(true);
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
        setStatus(null);
      }

      setLoading(false);
    }

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [channelId, currentUserId]);

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

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;

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
    <section className="rounded-3xl border border-accent/20 bg-card/35 p-4 md:p-6">

      <div className="space-y-5">
        {loading ? (
          <p className="text-sm text-muted">Loading discussion…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted">No messages yet. Start the conversation.</p>
        ) : (
          messages.map((message) => {
            const isRight = message.isCurrentUser;

            return (
              <article key={message.id} className={`flex ${isRight ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[88%] items-end gap-2 md:max-w-[68%] ${isRight ? "flex-row-reverse" : "flex-row"}`}>
                  <MessageAvatar author={message.author} avatarUrl={message.avatarUrl} />

                  <div className={`flex flex-col ${isRight ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-[1.2rem] px-4 py-3 text-sm leading-relaxed shadow-sm ${
                        isRight
                          ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
                          : "border border-accent/15 bg-white/70 text-slate-600"
                      }`}
                    >
                      <p className="whitespace-pre-line">{message.text}</p>
                    </div>

                    <div className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-muted">
                      <span>•••</span>
                      <span>{message.sentAt}</span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="mt-6 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={1000}
          className="flex-1 rounded-xl border border-accent/30 bg-bg/80 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          placeholder="Type your message"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>

      {status ? <p className="mt-3 text-xs text-amber-200">{status}</p> : null}
    </section>
  );
}
