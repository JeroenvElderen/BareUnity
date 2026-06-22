import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { loadViewerIdFromRequest } from "@/lib/viewer";
import { reportThreshold } from "@/lib/gallery-moderation";
import { enqueueDiscordAdminEvent } from "@/lib/discord-crosspost-sync";
import { db } from "@/server/db";

const REPORT_TARGET_TYPES = new Set([
  "post",
  "comment",
  "user",
  "media",
  "story",
  "message",
  "map_spot",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanReason(value: unknown) {
  if (typeof value !== "string") return "No reason provided";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1000) : "No reason provided";
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const reporterId = await loadViewerIdFromRequest(request);
  if (!reporterId) {
    return NextResponse.json(
      { error: "Please sign in before sending a report." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    targetType?: unknown;
    targetId?: unknown;
    reason?: unknown;
  };

  const targetType = cleanString(body.targetType).toLowerCase();
  const targetId = cleanString(body.targetId);
  const reason = cleanReason(body.reason);

  if (!REPORT_TARGET_TYPES.has(targetType)) {
    return NextResponse.json(
      { error: "Choose a valid report target." },
      { status: 400 },
    );
  }

  if (!targetId) {
    return NextResponse.json(
      { error: "Report target is required." },
      { status: 400 },
    );
  }

  if (
    (targetType === "post" ||
      targetType === "story" ||
      targetType === "comment" ||
      targetType === "user" ||
      targetType === "message" ||
      targetType === "map_spot") &&
    !UUID_PATTERN.test(targetId)
  ) {
    return NextResponse.json(
      { error: "Report target is not valid." },
      { status: 400 },
    );
  }

  if (targetType === "post" || targetType === "story") {
    const post = await db.posts.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!post)
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (targetType === "comment") {
    const comment = await db.comments.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!comment)
      return NextResponse.json(
        { error: "Comment not found." },
        { status: 404 },
      );
  }

  if (targetType === "user") {
    const profile = await db.profiles.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!profile)
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  if (targetType === "message") {
    const message = await db.channel_messages.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!message)
      return NextResponse.json(
        { error: "Message not found." },
        { status: 404 },
      );
  }

  if (targetType === "map_spot") {
    const spot = await db.naturist_map_spots.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!spot)
      return NextResponse.json(
        { error: "Map spot not found." },
        { status: 404 },
      );
  }

  const report = await db.reports.create({
    data: {
      reporter_id: reporterId,
      reason,
      target_type: targetType,
      target_id: targetId,
      post_id:
        targetType === "post" || targetType === "story" ? targetId : null,
      comment_id: targetType === "comment" ? targetId : null,
    },
    select: { id: true },
  });

  await enqueueDiscordAdminEvent({
    eventType: "admin_report_created",
    dedupeKey: `admin-report:${report.id}`,
    payload: {
      reportId: report.id,
      reporterId,
      targetType,
      targetId,
      reason,
      adminUrl: "/admin/reports",
    },
  }).catch((error) => {
    console.error("Unable to enqueue Discord admin report event", error);
  });

  if (targetType === "media") {
    const threshold = reportThreshold();
    const [countRow] = await db.$queryRaw<
      Array<{ report_count: number }>
    >(Prisma.sql`
      select count(*)::int as report_count
      from public.reports
      where target_type = 'media'
        and target_id = ${targetId}
    `);
    const reportCount = Number(countRow?.report_count ?? 0);

    await db.$executeRaw(Prisma.sql`
      update public.gallery_media
      set report_count = ${reportCount},
          gallery_type = case when ${reportCount} >= ${threshold} then 'pending' else gallery_type end,
          moderation_status = case when ${reportCount} >= ${threshold} then 'pending' else moderation_status end,
          moderation_reason = case
            when ${reportCount} >= ${threshold} then 'Automatically moved to Pending Review after reaching report threshold.'
            else moderation_reason
          end,
          updated_at = now()
      where image_path = ${targetId}
    `);
  }

  return NextResponse.json({ ok: true, reportId: report.id });
}
