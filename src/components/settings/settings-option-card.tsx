import type { ReactNode } from "react";

import styles from "./settings-option-card.module.css";

type LayoutVariant = "frame" | "split" | "glow" | "band";

type SettingsOptionCardProps = {
  label: string;
  detail: string;
  badge: string;
  stateNode: ReactNode;
  variant: LayoutVariant;
  onClick?: () => void;
};

function getLayoutClass(variant: LayoutVariant) {
  if (variant === "split") return styles.layoutSplit;
  if (variant === "glow") return styles.layoutGlow;
  if (variant === "band") return styles.layoutBand;
  return styles.layoutFrame;
}

export function SettingsOptionCard({ label, detail, badge, stateNode, variant, onClick }: SettingsOptionCardProps) {
  const className = `${styles.card} ${getLayoutClass(variant)} ${onClick ? styles.actionable : ""}`;

  const content = (
    <>
      <div className={styles.topRail} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.headlineRow}>
          <p className={styles.badge}>{badge}</p>
        </div>
        <h3 className={styles.title}>{label}</h3>
        <p className={styles.detail}>{detail}</p>
      </div>
      <div className={styles.footer}>
        <span className={styles.footerLine} aria-hidden="true" />
        <div className={styles.stateWrap}>{stateNode}</div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <article className={className}>{content}</article>;
}