import { VideoRoom } from "@/components/discussion/video-room";
import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "../page.module.css";
import styles from "../discussion/discussion.module.css";

export default function VideoRoomPage() {
  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page}>
        <VideoRoom />
      </section>
    </main>
  );
}