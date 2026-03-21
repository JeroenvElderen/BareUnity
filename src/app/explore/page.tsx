import { auth } from "@/auth";
import { MapStageClient } from "@/components/explore/map-stage-client";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { db } from "@/server/db";
import layoutStyles from "../page.module.css";
import styles from "./explore.module.css";

const liveUpdates = [
  { title: "Sunset Meadow", detail: "14 active nearby • calm weather", time: "2m" },
  { title: "Lakeside Gathering", detail: "Event starts in 35 minutes", time: "7m" },
  { title: "Pine Trail Circle", detail: "Trail density currently low", time: "12m" },
  { title: "River Bend", detail: "New check-in from the community", time: "18m" },
] as const;

async function getVerifiedStatus() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) return false;

  try {
    const submission = await db.verification_submissions.findUnique({
      where: { user_id: userId },
      select: { status: true },
    });

    return submission?.status === "approved";
  } catch (error) {
    console.error("Failed to load verification status", error);
    return false;
  }
}

export default async function ExplorePage() {
  const isVerified = await getVerifiedStatus();

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
            <button type="button">Now</button>
            <button type="button">Within 6 mi</button>
            <button type="button">Quiet places</button>
            <button type="button">Events</button>
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
              <MapStageClient isVerified={isVerified} />
            </div>
          </article>

          <aside className={styles.liveDock}>
            <header>
              <h2>Live updates</h2>
              <button type="button">Refresh</button>
            </header>

            <ul>
              {liveUpdates.map((item) => (
                <li key={item.title}>
                  <div>
                    <p>{item.title}</p>
                    <small>{item.detail}</small>
                  </div>
                  <span>{item.time}</span>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </section>
    </main>
  );
}