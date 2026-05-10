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
    <article className={styles.card} aria-label={`${name} map spot details`}>
      <header className={styles.hero}>
        <button type="button" className={styles.dismiss} onClick={onClose} aria-label="Close popup">
          ×
        </button>

        <div className={styles.heroContent}>
          <div className={styles.identity}>
            <div className={styles.avatar}>{initials}</div>
            <div className={styles.titleBlock}>
              <p className={styles.eyebrow}>Community map spot</p>
              <h3 className={styles.heading}>{name}</h3>
              <p className={styles.subheading}>Updated from recent community activity</p>
            </div>
          </div>

          <div className={styles.heroStats} aria-label="Quick spot status">
            <span className={styles.privacy}>{privacy}</span>
            <span className={styles.checkIns}>{isPublic ? "Open now" : "Low key"}</span>
            <span className={styles.checkIns}>{checkInCount} check-ins</span>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.descriptionPanel} aria-label="Description">
          <p className={styles.description}>{description}</p>
        </section>

        <section className={styles.facts} aria-label="Spot details">
          <div className={styles.fact}>
            <span className={styles.factIcon}>📍</span>
            <div>
              <p className={styles.factLabel}>Type</p>
              <p className={styles.factValue}>{spotType}</p>
            </div>
          </div>
          <div className={styles.fact}>
            <span className={styles.factIcon}>👥</span>
            <div>
              <p className={styles.factLabel}>Visitors</p>
              <p className={styles.factValue}>{visitors}</p>
            </div>
          </div>
          <div className={styles.fact}>
            <span className={styles.factIcon}>🛡️</span>
            <div>
              <p className={styles.factLabel}>Safety</p>
              <p className={styles.factValue}>{safety}</p>
            </div>
          </div>
        </section>

        <section className={styles.metrics} aria-label="Community signals">
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Mood</p>
            <p className={styles.metricValue}>{mood}</p>
          </div>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Access</p>
            <p className={styles.metricValue}>{privacy}</p>
          </div>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Check-ins</p>
            <p className={styles.metricValue}>{checkInCount}</p>
          </div>
        </section>

        <div className={styles.actions}>
          <button type="button" className={styles.cta} onClick={onCheckIn} disabled={isCheckingIn}>
            {isCheckingIn ? "Checking in..." : "Check in here"}
          </button>
          <p className={styles.helperText}>Let others know this marker is active and up to date.</p>
        </div>
        {checkInError ? <p className={styles.error}>{checkInError}</p> : null}
      </div>
    </article>
  );
}
