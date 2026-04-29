import { MapStageClient } from "@/components/explore/map-stage-client";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { db } from "@/server/db";
import layoutStyles from "../page.module.css";
import styles from "./explore.module.css";

function formatRelativeUpdateTime(createdAt: Date) {
  const diffMs = Date.now() - createdAt.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export default async function ExplorePage() {
  let latestMapSpots: Array<{
    id: string;
    name: string;
    description: string | null;
    created_at: Date;
  }> = [];

  try {
    latestMapSpots = await db.naturist_map_spots.findMany({
      orderBy: { created_at: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        description: true,
        created_at: true,
      },
    });
  } catch (error) {
    console.error("Failed to load map spots for Explore page", error);
  }

  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page}>
        <div className={styles.commandBar}>
          <label htmlFor="explore-search" className={styles.searchWrap}>
            <span>Search</span>
            <input id="explore-search" type="text" placeholder="Search spots, events, routes..." />
          </label>

          <div className={styles.commandChips}>
            <button type="button" data-explore-chip data-explore-chip-mode="all">
              Now
            </button>
            <button type="button" data-explore-chip data-explore-chip-mode="nearby">
              Within 6 mi
            </button>
            <button type="button" data-explore-chip data-explore-chip-mode="quiet">
              Quiet places
            </button>
            <button type="button" data-explore-chip data-explore-chip-mode="events">
              Events
            </button>
          </div>
        </div>

        <section className={styles.stage}>
          <article className={styles.mapPanel}>
            <div className={styles.mapTopMeta}>
              <p>Explore map</p>
              <div>
                <button type="button">Center</button>
                <button type="button">Layers</button>
              </div>
            </div>

            <div id="explore-map-container" className={styles.mapSurface}>
              <MapStageClient controls={{ searchInputId: "explore-search" }} />
            </div>
          </article>

          <aside className={styles.liveDock}>
            <header>
              <h2>Live updates</h2>
              <button type="button">Refresh</button>
            </header>

            <ul>
              {latestMapSpots.length ? (
                latestMapSpots.map((spot) => (
                  <li key={spot.id}>
                    <div>
                      <p>{spot.name}</p>
                    </div>
                    <span>{formatRelativeUpdateTime(spot.created_at)}</span>
                  </li>
                ))
              ) : (
                <li>
                  <div>
                    <p>No updates yet</p>
                    <small>Newly submitted locations will appear here in the order they were added.</small>
                  </div>
                  <span>—</span>
                </li>
              )}
            </ul>
          </aside>
        </section>
      </section>
    </main>
  );
}