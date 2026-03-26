import type { ReactNode } from "react";
import { AppSidebar } from "@/components/sidebar/sidebar";
import styles from "./layout.module.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <AppSidebar />
      <div className={styles.content}>{children}</div>
    </div>
  );
}