"use client";

export default function Home() {
  return (
    <div className="mock-body">
      <style jsx global>{`
        .mock-body {
          margin: 0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
          background:
            radial-gradient(circle at 0% 0%, rgba(124, 92, 255, 0.2), transparent 35%),
            radial-gradient(circle at 100% 10%, rgba(45, 212, 191, 0.12), transparent 25%),
            #0a0b10;
          color: #eef2ff;
          min-height: 100vh;
          padding: 24px;
        }

        .mock-shell {
          width: 1360px;
          height: 900px;
          margin: 0 auto;
          border: 1px solid #242941;
          border-radius: 26px;
          background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.0));
          backdrop-filter: blur(10px);
          display: grid;
          grid-template-columns: 250px 1fr 340px;
          overflow: hidden;
          box-shadow: 0 20px 80px rgba(0,0,0,0.45);
        }

        .mock-left, .mock-right { background: rgba(9, 11, 19, 0.66); }
        .mock-left { border-right: 1px solid #242941; padding: 22px 16px; }
        .mock-right { border-left: 1px solid #242941; padding: 22px 18px; }
        .mock-center { padding: 22px; overflow: hidden; }

        .mock-logo {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 26px;
          letter-spacing: 0.2px;
        }
        .mock-logo span { color: #7c5cff; }

        .mock-nav {
          display: grid;
          gap: 8px;
          margin-bottom: 22px;
        }
        .mock-nav-item {
          color: #8e97b8;
          font-size: 14px;
          padding: 11px 12px;
          border-radius: 12px;
          border: 1px solid transparent;
        }
        .mock-nav-item.active {
          color: #eef2ff;
          background: rgba(124, 92, 255, 0.16);
          border-color: rgba(124, 92, 255, 0.4);
        }

        .mock-cta {
          margin-top: 14px;
          border-radius: 14px;
          padding: 14px;
          border: 1px solid rgba(124,92,255,0.35);
          background: linear-gradient(170deg, rgba(124,92,255,0.2), rgba(124,92,255,0.04));
        }
        .mock-cta p { margin: 0 0 12px; color: #ccd3f8; font-size: 12px; line-height: 1.45; }
        .mock-cta button {
          border: 0;
          background: #7c5cff;
          color: white;
          border-radius: 999px;
          font-size: 12px;
          padding: 8px 12px;
          font-weight: 600;
        }

        .mock-topbar {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          margin-bottom: 16px;
          align-items: center;
        }
        .mock-search {
          background: #121522;
          border: 1px solid #242941;
          color: #8e97b8;
          border-radius: 14px;
          padding: 13px 14px;
          font-size: 14px;
        }
        .mock-quick {
          display: flex;
          gap: 10px;
        }
        .mock-chip {
          background: #121522;
          border: 1px solid #242941;
          color: #8e97b8;
          border-radius: 10px;
          font-size: 12px;
          padding: 10px 11px;
        }

        .mock-composer {
          border: 1px solid #242941;
          background: #121522;
          border-radius: 18px;
          padding: 14px;
          margin-bottom: 16px;
        }
        .mock-composer-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .mock-avatar { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(160deg, #8d76ff, #2dd4bf); }
        .mock-compose-input {
          flex: 1;
          padding: 11px 12px;
          border: 1px solid #242941;
          border-radius: 12px;
          font-size: 13px;
          color: #8e97b8;
          background: #171a2a;
        }
        .mock-composer-actions { display: flex; justify-content: space-between; align-items: center; }
        .mock-tools { display: flex; gap: 8px; }
        .mock-tool {
          font-size: 11px;
          color: #c9cff0;
          background: #1e2338;
          border: 1px solid #2a3150;
          border-radius: 999px;
          padding: 7px 10px;
        }
        .mock-publish {
          border: 0;
          background: #7c5cff;
          color: #fff;
          border-radius: 10px;
          font-weight: 600;
          padding: 9px 12px;
          font-size: 12px;
        }

        .mock-feed {
          height: calc(100% - 160px);
          overflow: hidden;
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr;
        }
        .mock-post {
          border: 1px solid #242941;
          background: #121522;
          border-radius: 18px;
          padding: 14px;
        }
        .mock-post-head { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .mock-id { display:flex; gap: 10px; align-items:center; }
        .mock-meta strong { display:block; font-size: 14px; }
        .mock-meta span { color: #8e97b8; font-size: 12px; }
        .mock-badge {
          color: #2dd4bf;
          font-size: 11px;
          border: 1px solid rgba(45,212,191,0.4);
          border-radius: 999px;
          padding: 5px 8px;
          height: fit-content;
          background: rgba(45,212,191,0.08);
        }
        .mock-post p { margin: 0 0 10px; color: #dce2ff; font-size: 13px; line-height: 1.5; }
        .mock-media {
          height: 130px;
          border-radius: 14px;
          border: 1px solid #2b3150;
          background:
            linear-gradient(125deg, rgba(124,92,255,0.4), rgba(45,212,191,0.2)),
            repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 6px, transparent 6px 12px);
          margin-bottom: 10px;
        }
        .mock-post-actions { color: #8e97b8; font-size: 12px; display:flex; gap:16px; }

        .mock-section-title { font-size: 13px; color: #8e97b8; margin-bottom: 12px; letter-spacing: 0.2px; }
        .mock-card {
          border: 1px solid #242941;
          background: #121522;
          border-radius: 14px;
          padding: 12px;
          margin-bottom: 10px;
        }

        .mock-profile-card {
          text-align: center;
          padding-top: 18px;
        }
        .mock-profile-avatar {
          width: 66px;
          height: 66px;
          border-radius: 50%;
          margin: 0 auto 10px;
          background: linear-gradient(150deg, #7c5cff, #2dd4bf);
          border: 2px solid rgba(124,92,255,0.45);
        }
        .mock-profile-handle {
          color: #8e97b8;
          font-size: 12px;
          margin-top: 2px;
        }
        .mock-stats-grid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .mock-stat {
          border: 1px solid #2b3150;
          border-radius: 10px;
          padding: 8px 6px;
          background: #171c2d;
        }
        .mock-stat strong { display: block; font-size: 13px; }
        .mock-stat span { color: #8e97b8; font-size: 10px; }

        .mock-goal-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px dashed #2a3151;
          font-size: 12px;
        }
        .mock-goal-item:last-child { border-bottom: 0; }
        .mock-goal-tag {
          color: #cfd6fa;
          border: 1px solid #384271;
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 10px;
        }

        .mock-activity-item {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 10px;
          align-items: start;
          margin-bottom: 10px;
        }
        .mock-activity-dot {
          width: 8px;
          height: 8px;
          margin-top: 6px;
          border-radius: 50%;
          background: #2dd4bf;
          box-shadow: 0 0 0 4px rgba(45,212,191,0.14);
        }
        .mock-activity-item p {
          margin: 0;
          font-size: 12px;
          color: #dbe3ff;
          line-height: 1.35;
        }
        .mock-activity-item span {
          color: #8e97b8;
          font-size: 11px;
        }
      `}</style>

      <div className="mock-shell">
        <aside className="mock-left">
          <div className="mock-logo">Bare<span>Unity</span></div>
          <div className="mock-nav">
            <div className="mock-nav-item active">🏠 Home Feed</div>
            <div className="mock-nav-item"># Explore Channels</div>
            <div className="mock-nav-item">🫂 Communities</div>
            <div className="mock-nav-item">📣 Brand Updates</div>
            <div className="mock-nav-item">🧪 Labs</div>
            <div className="mock-nav-item">⚙️ Settings</div>
          </div>
          <div className="mock-cta">
            <p>Design goal: increase discovery while keeping creators focused on fast posting.</p>
            <button>View prototype notes</button>
          </div>
        </aside>

        <main className="mock-center">
          <div className="mock-topbar">
            <div className="mock-search">🔎 Search channels, creators, and tags...</div>
            <div className="mock-quick">
              <div className="mock-chip">For You</div>
              <div className="mock-chip">Following</div>
              <div className="mock-chip">Trending</div>
            </div>
          </div>

          <section className="mock-composer">
            <div className="mock-composer-head">
              <div className="mock-avatar" />
              <div className="mock-compose-input">Share your progress with #ui-design and #growth...</div>
            </div>
            <div className="mock-composer-actions">
              <div className="mock-tools">
                <div className="mock-tool">📷 Image</div>
                <div className="mock-tool">🎬 Clip</div>
                <div className="mock-tool">📊 Poll</div>
              </div>
              <button className="mock-publish">Publish</button>
            </div>
          </section>

          <section className="mock-feed">
            <article className="mock-post">
              <div className="mock-post-head">
                <div className="mock-id">
                  <div className="mock-avatar" style={{ width: 36, height: 36 }} />
                  <div className="mock-meta">
                    <strong>Marina Lee · Product Designer</strong>
                    <span>2h ago · #homepage #experiments</span>
                  </div>
                </div>
                <div className="mock-badge">High engagement</div>
              </div>
              <p>Trying a denser home feed layout with contextual actions and stronger community signals. Thoughts on this card spacing?</p>
              <div className="mock-media" />
              <div className="mock-post-actions">❤️ 184 likes · 💬 32 comments · 🔁 11 reposts · 📌 Save</div>
            </article>

            <article className="mock-post">
              <div className="mock-post-head">
                <div className="mock-id">
                  <div className="mock-avatar" style={{ background: "linear-gradient(150deg,#ffd166,#ef476f)" }} />
                  <div className="mock-meta">
                    <strong>Aurora Studio</strong>
                    <span>4h ago · Sponsored · #creator-tools</span>
                  </div>
                </div>
                <div className="mock-badge" style={{ color: "#fbbf24", borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)" }}>Sponsored</div>
              </div>
              <p>Example data card: “Plan, publish, and analyze creator campaigns in one place.”</p>
              <div className="mock-post-actions">❤️ 74 likes · 💬 9 comments · 🔗 Learn more</div>
            </article>
          </section>
        </main>

      <aside className="mock-right">
          <div className="mock-section-title">Your profile</div>
          <div className="mock-card mock-profile-card">
            <div className="mock-profile-avatar" />
            <strong>Marina Lee</strong>
            <div className="mock-profile-handle">@marinadesigns · Product Designer</div>
            <div className="mock-stats-grid">
              <div className="mock-stat"><strong>12.4k</strong><span>Followers</span></div>
              <div className="mock-stat"><strong>428</strong><span>Following</span></div>
              <div className="mock-stat"><strong>86</strong><span>Posts</span></div>
            </div>
          </div>

          <div className="mock-section-title" style={{ marginTop: 18 }}>Goals this week</div>
          <div className="mock-card">
            <div className="mock-goal-item"><span>Ship feed prototype</span><span className="mock-goal-tag">In review</span></div>
            <div className="mock-goal-item"><span>Post 3 design updates</span><span className="mock-goal-tag">2/3 done</span></div>
            <div className="mock-goal-item"><span>Reply to comments</span><span className="mock-goal-tag">14 pending</span></div>
          </div>

          <div className="mock-section-title" style={{ marginTop: 18 }}>Recent activity</div>
          <div className="mock-card">
            <div className="mock-activity-item">
              <div className="mock-activity-dot" />
              <div><p>Your post reached 2.1k impressions.</p><span>42m ago</span></div>
            </div>
            <div className="mock-activity-item">
              <div className="mock-activity-dot" />
              <div><p>Noah Kim mentioned you in #community-growth.</p><span>1h ago</span></div>
            </div>
            <div className="mock-activity-item" style={{ marginBottom: 0 }}>
              <div className="mock-activity-dot" />
              <div><p>6 new followers from your last thread.</p><span>3h ago</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
