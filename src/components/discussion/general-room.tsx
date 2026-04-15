import { Hash, Mic, Paperclip, Send, Smile, Users } from "lucide-react";

import styles from "./general-room.module.css";

type Message = {
  id: number;
  author: string;
  role: "moderator" | "member";
  time: string;
  body: string;
};

const onlineMembers = ["SunTrail", "LunaFields", "MapleWave", "NakedNomad", "SageRiver", "WillowBreeze"];

const messages: Message[] = [
  {
    id: 1,
    author: "SageRiver",
    role: "moderator",
    time: "09:12",
    body: "Morning everyone 👋 Let’s keep this room cozy and respectful. Share where you’re connecting from today!",
  },
  {
    id: 2,
    author: "LunaFields",
    role: "member",
    time: "09:16",
    body: "Good morning from Portland! Planning a beach meet-up this weekend if weather stays warm ☀️",
  },
  {
    id: 3,
    author: "NakedNomad",
    role: "member",
    time: "09:19",
    body: "I’m in! Also put together a quick packing checklist for first-timers if anyone wants it.",
  },
  {
    id: 4,
    author: "SunTrail",
    role: "moderator",
    time: "09:22",
    body: "Love it. Pinning this thread later today. Keep suggestions coming 💬",
  },
];

export function GeneralRoom() {
  return (
    <section className={styles.roomShell} aria-label="General discussion room">
      <header className={styles.roomHeader}>
        <div>
          <p className={styles.roomLabel}>Discussion Room</p>
          <h1 className={styles.roomTitle}>
            <Hash size={20} aria-hidden />
            general
          </h1>
          <p className={styles.roomDescription}>A chill place to introduce yourself, coordinate events, and keep the community in sync.</p>
        </div>

        <div className={styles.roomMeta}>
          <span>
            <Users size={14} aria-hidden /> {onlineMembers.length} online
          </span>
          <span className={styles.liveDot}>Live</span>
        </div>
      </header>

      <div className={styles.roomBody}>
        <div className={styles.messagesPanel}>
          {messages.map((message) => (
            <article key={message.id} className={styles.messageCard}>
              <div className={styles.avatar} aria-hidden>
                {message.author.slice(0, 2).toUpperCase()}
              </div>
              <div className={styles.messageContent}>
                <p className={styles.messageMeta}>
                  <strong>{message.author}</strong>
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
              <li key={member}>{member}</li>
            ))}
          </ul>
        </aside>
      </div>

      <form className={styles.composer}>
        <button type="button" aria-label="Attach media">
          <Paperclip size={16} aria-hidden />
        </button>
        <input type="text" placeholder="Message #general" aria-label="Message general room" />
        <button type="button" aria-label="Add emoji">
          <Smile size={16} aria-hidden />
        </button>
        <button type="button" aria-label="Voice note">
          <Mic size={16} aria-hidden />
        </button>
        <button type="submit" className={styles.sendButton} aria-label="Send message">
          <Send size={16} aria-hidden />
        </button>
      </form>
    </section>
  );
}