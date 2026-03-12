type DiscussionMessage = {
  id: string;
  author: string;
  sentAt: string;
  isCurrentUser: boolean;
  text: string;
};

const SAMPLE_MESSAGES: DiscussionMessage[] = [
  {
    id: "m1",
    author: "Jennifer",
    sentAt: "9:12am",
    isCurrentUser: false,
    text: "I have shared an update. Please have a look.",
  },
  {
    id: "m2",
    author: "Jennifer",
    sentAt: "9:12am",
    isCurrentUser: false,
    text: "No, I have not thought about that. I better get some statistics from the Internet. I should not have any problems since the Internet has all kinds of data.",
  },
  {
    id: "m3",
    author: "You",
    sentAt: "9:12am",
    isCurrentUser: true,
    text: "Pictures are disabled in this channel, but your point is great. In order for you to succeed, you need to keep everyone interested and involved.",
  },
  {
    id: "m4",
    author: "Jennifer",
    sentAt: "9:12am",
    isCurrentUser: false,
    text: "You are absolutely right. I will take time to practice and to learn to relax and express myself really well. Wish me luck, Catherine!",
  },
  {
    id: "m5",
    author: "You",
    sentAt: "Just now",
    isCurrentUser: true,
    text: "I know you. You can do it. Good luck, Jennifer!",
  },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function MessageAvatar({ author }: { author: string }) {
  return (
    <span className="relative z-20 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-white bg-bg text-xs font-semibold text-text/90 shadow-sm">
      {getInitials(author)}
    </span>
  );
}

export default function DiscussionChannel() {
  return (
    <section className="rounded-3xl border border-accent/20 bg-card/35 p-4 md:p-6">
      <div className="mb-6 flex justify-center">
        <span className="rounded-lg border border-accent/25 bg-bg/70 px-3 py-1 text-xs font-medium text-muted">Today</span>
      </div>

      <div className="mb-5 rounded-2xl border border-amber-300/30 bg-amber-100/10 px-3 py-2 text-xs text-amber-100/85">
        This channel is text-only. Image messages are disabled.
      </div>

      <div className="space-y-7">
        {SAMPLE_MESSAGES.map((message) => {
          const isRight = message.isCurrentUser;

          return (
            <article key={message.id} className={`flex ${isRight ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] md:max-w-[64%] ${isRight ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`relative ${isRight ? "pr-6" : "pl-6"}`}>
                  <div
                    className={`relative rounded-[1.6rem] px-5 pt-4 pb-5 text-sm leading-relaxed shadow-sm ${
                      isRight
                        ? "pr-9 bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
                        : "pl-9 border border-accent/15 bg-white/70 text-slate-600"
                    }`}
                  >
                    <p className="whitespace-pre-line">{message.text}</p>

                  </div>

                  <div className={`pointer-events-none absolute -bottom-6 ${isRight ? "right-0" : "left-0"} z-10`}>
                    <span
                      className="absolute left-1/2 top-1/2 h-[4.1rem] w-[4.1rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#030711]"
                      aria-hidden
                    />
                    <MessageAvatar author={message.author} />
                  </div>
                </div>

                <div className={`mt-2 flex items-center gap-2 text-xs text-muted ${isRight ? "pr-14" : "pl-14"}`}>
                  <span>•••</span>
                  <span>{message.sentAt}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}