import styles from "./map-spot-popup.module.css";

type MapSpotPopupProps = {
  name: string;
  description: string;
  privacy: string;
  spotType: string;
  visitors: string;
  safety: string;
  mood: string;
  checkInCount: number;
  isCheckingIn?: boolean;
  checkInError?: string | null;
  onCheckIn?: () => void;
  onClose?: () => void;
};

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export function MapSpotPopup({
  name,
  description,
  privacy,
  spotType,
  visitors,
  safety,
  mood,
  checkInCount,
  isCheckingIn = false,
  checkInError,
  onCheckIn,
  onClose,
}: MapSpotPopupProps) {
  const isPublic = privacy === "Public";
  const initials = getInitials(name) || "SP";

  return (
    <article className={styles.card}>
      <header className={styles.hero}>
        <button type="button" className={styles.dismiss} onClick={onClose} aria-label="Close popup">
          ×
        </button>

        <div className={styles.identity}>
          <div className={styles.avatar}>{initials}</div>
          <div>
            <h4 className={styles.heading}>{name}</h4>
            <p className={styles.subheading}>Updated from community activity • Explore map</p>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.badges}>
          <span className={styles.privacy}>{privacy}</span>
          <span className={styles.live}>{isPublic ? "Open" : "Quiet"}</span>
        </div>

        <p className={styles.description}>{description}</p>

        <section className={styles.facts} aria-label="Spot details">
          <div className={styles.fact}>
            <span className={styles.factIcon}>📍</span>
            <p className={styles.factLabel}>Type</p>
            <p className={styles.factValue}>{spotType}</p>
          </div>
          <div className={styles.fact}>
            <span className={styles.factIcon}>👥</span>
            <p className={styles.factLabel}>Visitors</p>
            <p className={styles.factValue}>{visitors}</p>
          </div>
          <div className={styles.fact}>
            <span className={styles.factIcon}>🛡️</span>
            <p className={styles.factLabel}>Safety</p>
            <p className={styles.factValue}>{safety}</p>
          </div>
        </section>

        <button type="button" className={styles.cta} onClick={onCheckIn} disabled={isCheckingIn}>
          {isCheckingIn ? "Checking in..." : "Check in here"}
        </button>
        {checkInError ? <p className={styles.error}>{checkInError}</p> : null}

        <div className={styles.metrics}>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Mood</p>
            <p className={styles.metricValue}>{mood}</p>
          </div>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Safety</p>
            <p className={styles.metricValue}>{safety}</p>
          </div>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Check-ins</p>
            <p className={styles.metricValue}>{checkInCount}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
