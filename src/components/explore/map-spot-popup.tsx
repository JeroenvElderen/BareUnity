import styles from "./map-spot-popup.module.css";

type MapSpotPopupProps = {
  name: string;
  description: string;
  privacy: string;
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

export function MapSpotPopup({ name, description, privacy, onClose }: MapSpotPopupProps) {
  const isPublic = privacy === "Public";
  const initials = getInitials(name) || "SP";
  const mood = isPublic ? "Active" : "Calm";
  const checkIns = isPublic ? 24 : 9;

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
            <p className={styles.subheading}>Updated moments ago • Explore map</p>
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
            <p className={styles.factValue}>{isPublic ? "Open beach" : "Quiet retreat"}</p>
          </div>
          <div className={styles.fact}>
            <span className={styles.factIcon}>👥</span>
            <p className={styles.factLabel}>Visitors</p>
            <p className={styles.factValue}>{isPublic ? "Medium" : "Low"}</p>
          </div>
          <div className={styles.fact}>
            <span className={styles.factIcon}>🛡️</span>
            <p className={styles.factLabel}>Safety</p>
            <p className={styles.factValue}>Verified</p>
          </div>
        </section>

        <div className={styles.metrics}>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Mood</p>
            <p className={styles.metricValue}>{mood}</p>
          </div>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Safety</p>
            <p className={styles.metricValue}>Trusted</p>
          </div>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Check-ins</p>
            <p className={styles.metricValue}>{checkIns}</p>
          </div>
        </div>
      </div>
    </article>
  );
}