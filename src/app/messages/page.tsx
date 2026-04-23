"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { supabase } from "@/lib/supabase";
import layoutStyles from "../page.module.css";

import styles from "./messages.module.css";

type ConversationRow = {
  id: string;
  user_a: string;
  user_b: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ConversationPreview = {
  id: string;
  otherUserId: string;
  otherUserName: string;
  updatedAt: string;
};

const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

function displayName(profile: ProfileRow | undefined) {
  if (!profile) return "Unknown user";
  return profile.display_name?.trim() || profile.username || "Unknown user";
}

function orderedPair(left: string, right: string) {
  return left < right ? [left, right] : [right, left];
}

export default function MessagesPage() {
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [people, setPeople] = useState<ProfileRow[]>([]);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("dm_messages")
      .select("id,conversation_id,sender_id,body,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(250);

    if (error) {
      setErrorMessage("Could not load messages.");
      return;
    }

    setMessages((data ?? []) as MessageRow[]);
  }, []);


  const loadInbox = useCallback(async (currentViewerId: string) => {
    setErrorMessage(null);

    const friendsResponse = await supabase
      .from("friendships")
      .select("friend_user_id")
      .eq("user_id", currentViewerId)
      .not("friend_user_id", "is", null);

    if (friendsResponse.error) {
      setErrorMessage("Could not load your friends list.");
      setPeople([]);
      setConversations([]);
      setFriendIds([]);
      return;
    }

    const friendUserIds = Array.from(
      new Set((friendsResponse.data ?? []).map((row) => row.friend_user_id).filter((value): value is string => Boolean(value))),
    );

    setFriendIds(friendUserIds);

    if (!friendUserIds.length) {
      setPeople([]);
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      return;
    }

    const [profilesResponse, conversationsResponse] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,username,display_name")
        .in("id", friendUserIds)
        .order("display_name", { ascending: true })
        .limit(100),
      supabase
        .from("dm_conversations")
        .select("id,user_a,user_b,updated_at")
        .or(`user_a.eq.${currentViewerId},user_b.eq.${currentViewerId}`)
        .order("updated_at", { ascending: false }),
    ]);

    if (profilesResponse.error) {
      setErrorMessage("Could not load members for chat.");
    }

    if (conversationsResponse.error) {
      setErrorMessage("Could not load conversations.");
    }

    const peopleRows = (profilesResponse.data ?? []) as ProfileRow[];
    setPeople(peopleRows);

    const profileById = new Map(peopleRows.map((profile) => [profile.id, profile]));
    const allowedFriendIds = new Set(friendUserIds);
    const conversationRows = ((conversationsResponse.data ?? []) as ConversationRow[]).filter((conversation) => {
      const otherUserId = conversation.user_a === currentViewerId ? conversation.user_b : conversation.user_a;
      return allowedFriendIds.has(otherUserId);
    });

    const nextConversations = conversationRows
      .map((conversation) => {
        const otherUserId = conversation.user_a === currentViewerId ? conversation.user_b : conversation.user_a;
        return {
          id: conversation.id,
          otherUserId,
          otherUserName: displayName(profileById.get(otherUserId)),
          updatedAt: conversation.updated_at,
        } satisfies ConversationPreview;
      })
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

    setConversations(nextConversations);
    setActiveConversationId((current) => {
      const selected = current ?? nextConversations[0]?.id ?? null;
      if (selected) {
        void loadMessages(selected);
      }
      return selected;
    });
  }, [loadMessages]);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted) return;
      const id = data.user?.id ?? null;
      setViewerId(id);

      if (!id) {
        setIsLoading(false);
        return;
      }

      await loadInbox(id);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [loadInbox]);

  useEffect(() => {
    if (!activeConversationId) return;

    const subscription = supabase
      .channel(`dm-messages-${activeConversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${activeConversationId}` },
        () => {
          void loadMessages(activeConversationId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(subscription);
    };
  }, [activeConversationId, loadMessages]);

  const openConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    void loadMessages(conversationId);
  };

  const startConversation = async (targetUserId: string) => {
    if (!viewerId) return;
    if (!friendIds.includes(targetUserId)) {
      setErrorMessage("Direct messages are only available between friends.");
      return;
    }

    const [userA, userB] = orderedPair(viewerId, targetUserId);

    const { data: existingConversation } = await supabase
      .from("dm_conversations")
      .select("id")
      .eq("user_a", userA)
      .eq("user_b", userB)
      .maybeSingle<{ id: string }>();

    if (existingConversation?.id) {
      openConversation(existingConversation.id);
      await loadInbox(viewerId);
      return;
    }

    const { data, error } = await supabase
      .from("dm_conversations")
      .insert({ user_a: userA, user_b: userB })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      setErrorMessage("Could not start a conversation.");
      return;
    }

    await loadInbox(viewerId);
    openConversation(data.id);
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!viewerId || !activeConversationId) return;
    if (!activeConversation || !friendIds.includes(activeConversation.otherUserId)) {
      setErrorMessage("Direct messages are only available between friends.");
      return;
    }

    const body = draft.trim();
    if (!body) return;

    setDraft("");

    const { error: insertError } = await supabase.from("dm_messages").insert({
      conversation_id: activeConversationId,
      sender_id: viewerId,
      body,
    });

    if (insertError) {
      setErrorMessage("Could not send message.");
      return;
    }

    const { error: updateError } = await supabase
      .from("dm_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", activeConversationId);

    if (updateError) {
      setErrorMessage("Message sent, but failed to bump conversation time.");
    }

    await Promise.all([loadMessages(activeConversationId), loadInbox(viewerId)]);
  };

  if (!viewerId && !isLoading) {
    return <p>Please sign in to use direct messages.</p>;
  }

  const conversationsByFriendId = new Set(conversations.map((conversation) => conversation.otherUserId));
  const startableFriends = people.filter((person) => !conversationsByFriendId.has(person.id));

  return (
    <main className={`${layoutStyles.main} w-full max-w-full`}>
      <AppSidebar />
      <section className={`${styles.page} min-w-0 w-full flex-1 overflow-hidden`}>
        <h1>Messages</h1>
        {errorMessage ? <p className={styles.empty}>{errorMessage}</p> : null}

        <div className={styles.layout}>
          <aside className={styles.panel}>
            <h2 className={styles.title}>Chats</h2>
            <ul className={styles.conversationList}>
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    className={`${styles.rowButton} ${conversation.id === activeConversationId ? styles.rowButtonActive : ""}`}
                    type="button"
                    onClick={() => openConversation(conversation.id)}
                  >
                    <strong>{conversation.otherUserName}</strong>
                    <p className={styles.meta}>Updated {timeFormatter.format(new Date(conversation.updatedAt))}</p>
                  </button>
                </li>
              ))}
            </ul>

            <h3 className={styles.subtitle}>Start new chat</h3>
            <ul className={styles.userList}>
              {startableFriends.map((person) => (
                <li key={person.id}>
                  <button className={styles.rowButton} type="button" onClick={() => void startConversation(person.id)}>
                    {displayName(person)}
                  </button>
                </li>
              ))}
              {!people.length && !isLoading ? <li className={styles.empty}>Add friends to start messaging.</li> : null}
              {!startableFriends.length && people.length > 0 && !isLoading ? (
                <li className={styles.empty}>You already have chats with all friends.</li>
              ) : null}
            </ul>
          </aside>

          <div className={`${styles.panel} ${styles.chatShell}`}>
            <header>
              <h2 className={styles.title}>{activeConversation ? activeConversation.otherUserName : "Pick a chat"}</h2>
            </header>

            <ul className={styles.messageList}>
              {activeConversationId
                ? messages.map((message) => (
                    <li
                      key={message.id}
                      className={`${styles.bubble} ${message.sender_id === viewerId ? styles.mine : styles.theirs}`}
                      aria-label={message.sender_id === viewerId ? "Your message" : "Incoming message"}
                    >
                      <p>{message.body}</p>
                      <p className={styles.meta}>{timeFormatter.format(new Date(message.created_at))}</p>
                    </li>
                  ))
                : null}
              {!messages.length && activeConversationId ? <li className={styles.empty}>No messages yet. Say hi 👋</li> : null}
              {!activeConversationId ? <li className={styles.empty}>Choose a chat on the left.</li> : null}
            </ul>

            <form className={styles.composer} onSubmit={sendMessage}>
              <input
                type="text"
                placeholder={activeConversationId ? "Write a message" : "Select conversation first"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={1200}
                disabled={!activeConversationId}
              />
              <button type="submit" disabled={!activeConversationId || !draft.trim()}>
                Send
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}