import { supabase } from "@/lib/supabase";

export type ReportTargetType = "post" | "comment" | "user" | "media" | "story" | "message" | "map_spot";

export async function submitReport(args: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
}) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return { ok: false, message: "Please sign in before sending a report." };
  }

  const response = await fetch("/api/reports", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    return { ok: false, message: payload.error ?? "Could not send this report." };
  }

  return { ok: true, message: "Thanks — your report was sent to the moderation team." };
}

export async function promptAndSubmitReport(args: {
  targetType: ReportTargetType;
  targetId: string | null | undefined;
  label: string;
}) {
  if (!args.targetId) return { ok: false, message: "This item cannot be reported yet." };

  const reason = window.prompt(`Why are you reporting this ${args.label}?`, "");
  if (reason === null) return { ok: false, message: "" };

  return submitReport({
    targetType: args.targetType,
    targetId: args.targetId,
    reason,
  });
}