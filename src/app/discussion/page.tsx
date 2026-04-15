import { GeneralRoom } from "@/components/discussion/general-room";
import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "../page.module.css";
import styles from "./discussion.module.css";

export default function DiscussionPage() {
  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page}>
        <GeneralRoom />
      </section>
    </main>
  );
}