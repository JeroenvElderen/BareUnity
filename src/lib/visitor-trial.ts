export const VISITOR_TRIAL_DAYS = 7;

export const VISITOR_TRIAL_LOCKED_ACTIONS = [
  "post",
  "comment",
  "like",
  "message",
  "friend_request",
  "check_in",
  "place_submission",
] as const;

export type VisitorTrialMetadata = {
  visitor_trial: "active" | "expired";
  visitor_trial_started_at: string;
  visitor_trial_ends_at: string;
  visitor_trial_locked_actions: typeof VISITOR_TRIAL_LOCKED_ACTIONS[number][];
};

export type VisitorTrialStatus = {
  isVisitorTrial: boolean;
  isActive: boolean;
  endsAt: Date | null;
  daysRemaining: number;
  lockedActions: typeof VISITOR_TRIAL_LOCKED_ACTIONS[number][];
};

export function getVisitorTrialEndDate(startDate = new Date()) {
  return new Date(startDate.getTime() + VISITOR_TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function buildVisitorTrialMetadata(startDate = new Date()): VisitorTrialMetadata {
  const endsAt = getVisitorTrialEndDate(startDate);

  return {
    visitor_trial: "active",
    visitor_trial_started_at: startDate.toISOString(),
    visitor_trial_ends_at: endsAt.toISOString(),
    visitor_trial_locked_actions: [...VISITOR_TRIAL_LOCKED_ACTIONS],
  };
}

export function getVisitorTrialStatus(
  metadata: Record<string, unknown> | null | undefined,
  now = new Date(),
): VisitorTrialStatus {
  const rawEndsAt = metadata?.visitor_trial_ends_at;
  const endsAt = typeof rawEndsAt === "string" ? new Date(rawEndsAt) : null;
  const hasValidEndDate = endsAt !== null && !Number.isNaN(endsAt.getTime());
  const isVisitorTrial = metadata?.visitor_trial === "active" && hasValidEndDate;
  const millisecondsRemaining = hasValidEndDate ? endsAt.getTime() - now.getTime() : 0;
  const isActive = isVisitorTrial && millisecondsRemaining > 0;
  const daysRemaining = isActive
    ? Math.max(1, Math.ceil(millisecondsRemaining / (24 * 60 * 60 * 1000)))
    : 0;

  return {
    isVisitorTrial,
    isActive,
    endsAt: hasValidEndDate ? endsAt : null,
    daysRemaining,
    lockedActions: [...VISITOR_TRIAL_LOCKED_ACTIONS],
  };
}