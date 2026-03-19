export type NsfwScores = {
  pornography: number;
  enticingOrSensual: number;
  normal: number;
};

export type SexualContextSignals = {
  visibleGenitals?: boolean;
  erection?: boolean;
  genitalContact?: boolean;
};

export type ModerationDecision = "allow" | "review" | "block";

export type ModerationResult = {
  decision: ModerationDecision;
  scores: NsfwScores;
  reason: string;
};

export type SexualSeverity = 0 | 1 | 2 | 3;

export type SexualSeverityResult = {
  score: SexualSeverity;
  reason: string;
};

/**
 * Normalize HF output
 */
export function toNsfwScores(entries: any[]): NsfwScores {
  let pornography = 0;
  let sensual = 0;
  let normal = 0;

  for (const e of entries) {
    const label = e.label?.toLowerCase?.() ?? "";
    const score = e.score ?? 0;

    if (label.includes("nsfw")) pornography = Math.max(pornography, score);
    if (label.includes("normal") || label.includes("safe"))
      normal = Math.max(normal, score);
    if (label.includes("sensual") || label.includes("sexy"))
      sensual = Math.max(sensual, score);
  }

  return {
    pornography,
    enticingOrSensual: sensual,
    normal,
  };
}

/**
 * 🔥 IMPORTANT: Only detect interaction risk
 */
export function inferContextSignals(
  scores: NsfwScores
): SexualContextSignals {
  const signals: SexualContextSignals = {};

  // Nudity always allowed → only used for severity
  if (scores.pornography > 0.25) {
    signals.visibleGenitals = true;
  }

  // erection proxy
  if (scores.pornography > 0.6) {
    signals.erection = true;
  }

  // 🚨 ONLY thing we really care about: interaction
  if (scores.pornography > 0.4 && scores.normal < 0.7) {
    signals.genitalContact = true;
  }

  return signals;
}

/**
 * 🔥 Naturist-friendly moderation
 */
export function moderateNsfwScores(
  scores: NsfwScores,
  options: {
    allowExplicit: boolean;
    signals?: SexualContextSignals;
  }
): ModerationResult {
  const s = options.signals ?? {};

  // 🚨 ONLY BLOCK RULE
  if (s.genitalContact) {
    return {
      decision: "block",
      scores,
      reason: "sexual interaction not allowed",
    };
  }

  // ✅ EVERYTHING ELSE ALLOWED
  return {
    decision: "allow",
    scores,
    reason: "nudity allowed (naturist platform)",
  };
}

/**
 * 🔥 Business policy (user overrides)
 */
export function applyBusinessPolicy(
  moderation: ModerationResult,
  scores: NsfwScores,
  signals: SexualContextSignals,
  userEmail: string
): ModerationResult {
  const isOwner = userEmail === "jeroen.vanelderen@hotmail.com";

  // 🚨 interaction always blocked (even for owner)
  if (signals.genitalContact) {
    return {
      decision: "block",
      scores,
      reason: "genital contact not allowed",
    };
  }

  // erection allowed for owner
  if (signals.erection && isOwner) {
    return {
      decision: "allow",
      scores,
      reason: "owner override (erection allowed)",
    };
  }

  return moderation;
}

/**
 * Severity = informational only
 */
export function calculateSexualSeverity(
  scores: NsfwScores,
  signals: SexualContextSignals
): SexualSeverityResult {
  if (signals.genitalContact) {
    return { score: 3, reason: "sexual interaction" };
  }

  if (signals.erection) {
    return { score: 2, reason: "erection" };
  }

  if (signals.visibleGenitals) {
    return { score: 1, reason: "nudity" };
  }

  return { score: 0, reason: "none" };
}