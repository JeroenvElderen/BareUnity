import { MapStageClient } from "@/components/explore/map-stage-client";
import { AppSidebar } from "@/components/sidebar/sidebar";
import { ExploreSearchOverlay } from "./explore-search-overlay";
import layoutStyles from "../page.module.css";
import styles from "./explore.module.css";

export default function ExplorePage() {
  return (
    <main className={`${layoutStyles.main} ${styles.exploreMain}`}>
      <AppSidebar />

      <section className={styles.page} aria-label="Explore map">
        <section className={styles.stage}>
          <article className={styles.mapPanel}>
            <div id="explore-map-container" className={styles.mapSurface}>
              <MapStageClient />
            </div>

            <ExploreSearchOverlay />
          </article>
        </section>
      </section>
    </main>
  );
}
