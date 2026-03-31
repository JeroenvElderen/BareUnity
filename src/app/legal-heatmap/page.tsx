import { LegalHeatmapStageClient } from "@/components/explore/legal-heatmap-stage-client";
import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "../page.module.css";
import styles from "./legal-heatmap.module.css";

export default function LegalHeatmapPage() {
  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page}>
        <header className={styles.header}>
          <h1>Legal heatmap by region</h1>
          <p>Real-world legal references by country and region to help reduce legal risk when planning travel.</p>
        </header>

        <section className={styles.panel}>
          <LegalHeatmapStageClient />
        </section>
      </section>
    </main>
  );
}