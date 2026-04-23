"use client";

import { Hash, Mic, Paperclip, Send, Smile, Users } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { UsernameActionPopup } from "@/components/social/username-action-popup";

import styles from "./general-room.module.css";

type ChannelRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_by: string | null;
};

type DbProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type DbMessage = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  profiles: DbProfile | DbProfile[] | null;
};

type RoomMessage = {
  id: string;
  authorId: string;
  authorUsername: string | null;
  author: string;
  avatarSeed: string;
  role: "moderator" | "member";
  time: string;
  body: string;
};

type OnlineMember = {
  userId: string;
  name: string;
  initials: string;
};

const messageTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
});

function profileDisplayName(profile: DbProfile | null | undefined, fallback = "member") {
  if (!profile) return fallback;
  return profile.display_name || profile.username || fallback;
}

function profileInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "ME";

  const pieces = trimmed.split(/\s+/).filter(Boolean);
  if (!pieces.length) return "ME";
  if (pieces.length === 1) return pieces[0]!.slice(0, 2).toUpperCase();
  return `${pieces[0]![0]}${pieces[1]![0]}`.toUpperCase();
}

export function GeneralRoom() {
  const quickEmojis = ["😀", "😂", "🔥", "👏", "🙏", "❤️"];
  const [channel, setChannel] = useState<ChannelRecord | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerPresenceName, setViewerPresenceName] = useState("member");
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>("--:--");
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRoomData = useCallback(async () => {
    setLoadError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setViewerId(user?.id ?? null);
      if (user?.id) {
        const { data: viewerProfile } = await supabase
          .from("profiles")
          .select("display_name,username")
          .eq("id", user.id)
          .maybeSingle<{ display_name: string | null; username: string | null }>();
        const viewerName = viewerProfile?.display_name || viewerProfile?.username || "member";
        setViewerPresenceName(viewerName);
      } else {
        setViewerPresenceName("member");
      }

      const { data: channelData, error: channelError } = await supabase
        .from("channels")
        .select("id,name,slug,description,created_by")
        .eq("slug", "general")
        .maybeSingle<ChannelRecord>();

      if (channelError) {
        setLoadError("Could not load discussion channel.");
        setIsLoading(false);
        return;
      }

      if (!channelData) {
        setLoadError("No #general channel exists yet.");
        setIsLoading(false);
        return;
      }

      setChannel(channelData);

      const { data: messageRows, error: messagesError } = await supabase
        .from("channel_messages")
        .select("id,body,created_at,author_id,profiles:profiles(id,username,display_name,avatar_url)")
        .eq("channel_id", channelData.id)
        .order("created_at", { ascending: true })
        .limit(120)
        .returns<DbMessage[]>();

      if (messagesError) {
        setLoadError("Could not load messages for #general.");
        setIsLoading(false);
        return;
      }

      const parsedMessages = (messageRows ?? []).map((message) => {
        const profile = Array.isArray(message.profiles) ? message.profiles[0] : message.profiles;
        const author = profileDisplayName(profile);
        const isModerator = channelData.created_by ? message.author_id === channelData.created_by : false;

        return {
          id: message.id,
          authorId: message.author_id,
          authorUsername: profile?.username ?? null,
          author,
          avatarSeed: profileInitials(author),
          role: isModerator ? "moderator" : "member",
          time: messageTimeFormatter.format(new Date(message.created_at)),
          body: message.body,
        } satisfies RoomMessage;
      });

    setMessages(parsedMessages);

      if (!onlineMembers.length) {
        const uniqueFromMessages = Array.from(new Set(parsedMessages.map((message) => message.author)));
        const bootstrappedMembers = uniqueFromMessages.map((name, index) => ({
          userId: `bootstrap-${index}`,
          name,
          initials: profileInitials(name),
        }));
        setOnlineMembers(bootstrappedMembers);
      }
      setLastUpdatedLabel(messageTimeFormatter.format(new Date()));
    } catch (error) {
      console.error("Failed to load discussion room data", error);
      setLoadError("Could not load discussion right now. Please retry.");
    } finally {
      setIsLoading(false);
    }
  }, [onlineMembers.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRoomData();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadRoomData]);

  useEffect(() => {
    if (!channel?.id) return;

    const roomChannel = supabase
      .channel(`discussion-room-${channel.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_messages", filter: `channel_id=eq.${channel.id}` },
        () => {
          void loadRoomData();
        },
      );

    void roomChannel.subscribe();

    return () => {
      void supabase.removeChannel(roomChannel);
    };
  }, [channel?.id, loadRoomData]);

  useEffect(() => {
    if (!channel?.id || !viewerId) return;

    const presenceKey = viewerId;
    const onlineChannel = supabase.channel(`discussion-room-online-${channel.id}`, {
      config: {
        presence: { key: presenceKey },
      },
    });

    onlineChannel
      .on("presence", { event: "sync" }, () => {
        const presenceState = onlineChannel.presenceState<{
          user_id?: string;
          name?: string;
          initials?: string;
          online_at?: string;
        }>();

        const nextMembers = Object.entries(presenceState)
          .map(([key, presences]) => {
            const currentPresence = presences[presences.length - 1];
            const name = currentPresence?.name?.trim() || "member";
            return {
              userId: currentPresence?.user_id || key,
              name,
              initials: currentPresence?.initials || profileInitials(name),
            } satisfies OnlineMember;
          })
          .sort((left, right) => left.name.localeCompare(right.name));

        setOnlineMembers(nextMembers);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;

        await onlineChannel.track({
          user_id: viewerId,
          name: viewerPresenceName,
          initials: profileInitials(viewerPresenceName),
          online_at: new Date().toISOString(),
        });
      });

    return () => {
      void onlineChannel.untrack();
      void supabase.removeChannel(onlineChannel);
    };
  }, [channel?.id, viewerId, viewerPresenceName]);

  const canSend = Boolean(channel?.id && viewerId && draft.trim()) && !isSending;

  const roomDescription = useMemo(() => {
    if (channel?.description?.trim()) return channel.description;
    return "A chill place to introduce yourself, coordinate events, and keep the community in sync.";
  }, [channel?.description]);

  const sendMessage = async () => {
    if (!channel?.id || !viewerId || !draft.trim() || isSending) return;

    setIsSending(true);

    const { error } = await supabase.from("channel_messages").insert({
      channel_id: channel.id,
      author_id: viewerId,
      body: draft.trim(),
    });

    if (!error) {
      setDraft("");
      void loadRoomData();
    }

    if (error) {
      setLoadError("Could not send message. Check Supabase RLS for channel_messages.");
    }

    setIsSending(false);
  };

  const addEmojiToDraft = (emoji: string) => {
    if (!viewerId || isSending) return;
    setDraft((current) => `${current}${emoji}`);
    setIsEmojiOpen(false);
  };

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage();
  };

  return (
    <section className={styles.roomShell} aria-label="General discussion room">
      <header className={styles.roomHeader}>
        <div>
          <p className={styles.roomLabel}>Discussion Room</p>
          <h1 className={styles.roomTitle}>
            <Hash size={20} aria-hidden />
            {channel?.slug ?? "general"}
          </h1>
          <p className={styles.roomDescription}>{roomDescription}</p>
          {loadError ? <p className={styles.statusError}>{loadError}</p> : null}
        </div>

        <div className={styles.roomMeta}>
          <span>
            <Users size={14} aria-hidden /> {onlineMembers.length} online
          </span>
          <span className={styles.liveDot}>Live</span>
          <span>Updated {lastUpdatedLabel}</span>
        </div>
      </header>

      <div className={styles.roomBody}>
        <div className={styles.messagesPanel}>
          {isLoading ? <p className={styles.statusInfo}>Loading messages…</p> : null}
          {!isLoading && !messages.length ? <p className={styles.statusInfo}>No messages yet. Start the conversation.</p> : null}
          {messages.map((message) => (
            <article key={message.id} className={styles.messageCard}>
              <div className={styles.avatar} aria-hidden>
                {message.avatarSeed}
              </div>
              <div className={styles.messageContent}>
                <p className={styles.messageMeta}>
                  <UsernameActionPopup
                    userId={message.authorId}
                    username={message.authorUsername}
                    displayName={message.author}
                    triggerClassName="font-semibold underline-offset-2 hover:underline"
                  />
                  <span className={message.role === "moderator" ? styles.modBadge : styles.memberBadge}>{message.role}</span>
                  <time>{message.time}</time>
                </p>
                <p>{message.body}</p>
              </div>
            </article>
          ))}
        </div>

        <aside className={styles.onlinePanel}>
          <p className={styles.onlineTitle}>Online Now</p>
          <ul>
            {onlineMembers.map((member) => (
              <li key={member.userId}>
                <span className={styles.onlineInitials} aria-hidden>
                  {member.initials}
                </span>
                <span className={styles.onlineName}>{member.name}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <div className={styles.composerWrap}>
        {isEmojiOpen ? (
          <div className={styles.emojiTray} role="listbox" aria-label="Emoji picker">
            {quickEmojis.map((emoji) => (
              <button key={emoji} type="button" onClick={() => addEmojiToDraft(emoji)} aria-label={`Add ${emoji}`}>
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        <form className={styles.composer} onSubmit={submitMessage}>
          <button type="button" className={styles.attachButton} aria-label="Attach media" disabled>
            <Paperclip size={16} aria-hidden />
          </button>
          <input
            type="text"
            placeholder={viewerId ? "Message #general" : "Sign in to chat"}
            aria-label="Message general room"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1200}
            disabled={!viewerId || isSending}
          />
          <button
            type="button"
            className={styles.emojiButton}
            aria-label="Add emoji"
            onClick={() => setIsEmojiOpen((current) => !current)}
            disabled={!viewerId || isSending}
          >
            <Smile size={16} aria-hidden />
          </button>
          <button type="button" className={styles.voiceButton} aria-label="Voice note" disabled>
            <Mic size={16} aria-hidden />
          </button>
          <button type="submit" className={styles.sendButton} aria-label="Send message" disabled={!canSend}>
            <Send size={16} aria-hidden />
          </button>
        </form>
      </div>
    </section>
  );
}