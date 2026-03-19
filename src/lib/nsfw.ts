export type NsfwScores = {
  pornography: number;
  enticingOrSensual: number;
  normal: number;
};

export type ModerationDecision = "allow" | "review" | "block";

export type ModerationResult = {
  decision: ModerationDecision;
  scores: NsfwScores;
  reason: string;
};

export type ModerationOptions = {
  allowExplicit: boolean;
};

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

export function toNsfwScores(entries: Array<{ label: string; score: number }>): NsfwScores {
  const scoreByLabel = new Map(entries.map((entry) => [normalizeLabel(entry.label), entry.score]));

  const pornography = scoreByLabel.get("pornography") ?? scoreByLabel.get("porn") ?? 0;

  const enticingOrSensual = scoreByLabel.get("enticing or sensual") ?? scoreByLabel.get("sensual") ?? 0;

  const normal = scoreByLabel.get("normal") ?? scoreByLabel.get("safe") ?? 0;

  return {
    pornography,
    enticingOrSensual,
    normal,
  };
}

export function moderateNsfwScores(scores: NsfwScores, options: ModerationOptions): ModerationResult {
  if (scores.pornography > 0.85) {
    if (options.allowExplicit) {
      return {
        decision: "allow",
        scores,
        reason: "explicit content allowed for trusted uploader",
      };
    }

    return {
      decision: "block",
      scores,
      reason: "explicit sexual content is not allowed for this account",
    };
  }

  if (scores.pornography > 0.5) {
    return {
      decision: "review",
      scores,
      reason: "high nudity confidence requires manual review",
    };
  }

  if (scores.enticingOrSensual > 0.7) {
    return {
      decision: "allow",
      scores,
      reason: "sensual but not explicit",
    };
  }

  if (scores.normal > 0.6) {
    return {
      decision: "allow",
      scores,
      reason: "normal-safe content",
    };
  }

  return {
    decision: "review",
    scores,
    reason: "uncertain classification",
  };
}