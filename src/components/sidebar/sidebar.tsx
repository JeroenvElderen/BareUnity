import {
  Bell,
  Compass,
  Home,
  MessageCircle,
  PlusSquare,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

import styles from "./sidebar.module.css";

const primaryItems = [
  { icon: Home, label: "Home", active: true },
  { icon: Search, label: "Search" },
  { icon: Compass, label: "Explore" },
  { icon: MessageCircle, label: "Messages", badge: "4" },
] as const;

const communityItems = [
  { icon: Users, label: "Communities" },
  { icon: PlusSquare, label: "Create" },
  { icon: Bell, label: "Notifications", badge: "9+" },
  { icon: Settings, label: "Settings" },
] as const;

export function AppSidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Main sidebar navigation">
      <header className={styles.header}>
        <div className={styles.logoMark} aria-hidden>
          <Sparkles size={16} />
        </div>
        <div>
          <h1>BareUnity</h1>
          <p>Connect • Share • Be free</p>
        </div>
      </header>

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Main</p>
        <nav>
          {primaryItems.map(({ icon: Icon, label, active, badge }) => (
            <a key={label} href="#" className={`${styles.navItem} ${active ? styles.active : ""}`}>
              <span className={styles.itemLeft}>
                <Icon size={18} aria-hidden />
                <span>{label}</span>
              </span>
              {badge ? <span className={styles.badge}>{badge}</span> : null}
            </a>
          ))}
        </nav>
      </section>

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Workspace</p>
        <nav>
          {communityItems.map(({ icon: Icon, label, badge }) => (
            <a key={label} href="#" className={styles.navItem}>
              <span className={styles.itemLeft}>
                <Icon size={18} aria-hidden />
                <span>{label}</span>
              </span>
              {badge ? <span className={styles.badge}>{badge}</span> : null}
            </a>
          ))}
        </nav>
      </section>

      <footer className={styles.footerCard}>
        <p>Starter layout ready.</p>
        <small>Next: content blocks</small>
      </footer>
    </aside>
  );
}