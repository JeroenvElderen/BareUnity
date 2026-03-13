export default function Home() {
  const posts = [
    {
      author: "Luna Rivers",
      handle: "@luna.nature",
      time: "2h",
      badge: "Mindful Living",
      text: "Sunrise yoga by the cedar trail felt grounding today. Sharing 3 breath techniques that helped me reset.",
      stats: "142 likes · 27 comments",
    },
    {
      author: "Kai Meadow",
      handle: "@kai.retreats",
      time: "4h",
      badge: "Retreats",
      text: "Weekend retreat schedule is up: forest walk, tea circle, and a beginner-friendly body-positivity workshop.",
      stats: "201 likes · 49 comments",
    },
    {
      author: "BareUnity Team",
      handle: "@bareunity",
      time: "6h",
      badge: "Community",
      text: "New channels are live! Explore Naturist Map updates and local event check-ins with improved moderation tools.",
      stats: "318 likes · 76 comments",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto grid max-w-[1320px] grid-cols-12 gap-4 px-4 py-6 lg:px-8">
        <aside className="col-span-12 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:col-span-3 xl:col-span-2">
          <h1 className="mb-6 text-xl font-bold">
            Bare<span className="text-violet-400">Unity</span>
          </h1>
          <nav className="space-y-2 text-sm">
            {[
              "Home Feed",
              "Channels",
              "Discover",
              "Messages",
              "Notifications",
              "Profile",
            ].map((item, i) => (
              <div
                key={item}
                className={`rounded-lg border px-3 py-2 ${
                  i === 0
                    ? "border-violet-500/50 bg-violet-500/15 text-white"
                    : "border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800/70"
                }`}
              >
                {item}
              </div>
            ))}
          </nav>
        </aside>

        <section className="col-span-12 md:col-span-9 xl:col-span-7">
          <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400" />
              <div className="flex-1 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-slate-400">
                Share a mindful moment with your community...
              </div>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <div className="space-x-3">
                <span>📷 Photo</span>
                <span>📍 Location</span>
                <span>🧘 Mood</span>
              </div>
              <button className="rounded-lg bg-violet-500 px-3 py-1.5 font-medium text-white hover:bg-violet-400">
                Post
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {posts.map((post) => (
              <article key={post.author + post.time} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{post.author}</p>
                    <p className="text-xs text-slate-400">
                      {post.handle} · {post.time}
                    </p>
                  </div>
                  <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-300">
                    {post.badge}
                  </span>
                </div>
                <p className="mb-3 text-sm text-slate-200">{post.text}</p>
                <div className="mb-3 h-32 rounded-xl border border-slate-700 bg-gradient-to-br from-violet-500/25 to-cyan-500/10" />
                <div className="text-xs text-slate-400">{post.stats}</div>
              </article>
            ))}
          </div>
        </section>

        <aside className="col-span-12 space-y-3 md:col-span-12 xl:col-span-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="mb-2 text-sm font-semibold">Suggested Channels</p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li># Naturist Map</li>
              <li># Retreats</li>
              <li># General Nature</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="mb-2 text-sm font-semibold">Profile Snapshot</p>
            <p className="text-sm text-slate-300">@you · Explorer tier</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-slate-700 p-2">88
                <div className="text-slate-400">Posts</div>
              </div>
              <div className="rounded-lg border border-slate-700 p-2">1.2k
                <div className="text-slate-400">Followers</div>
              </div>
              <div className="rounded-lg border border-slate-700 p-2">340
                <div className="text-slate-400">Following</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>  
  );
}