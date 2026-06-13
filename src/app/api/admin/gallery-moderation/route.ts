import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  classifyPostImageByPersonPresence,
  parseGalleryType,
} from "@/lib/gallery-moderation";
import { detectPersonInImage } from "@/lib/person-detection";
import { ensureAdminRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { db } from "@/server/db";

type Action =
  | "approve_nude"
  | "approve_general"
  | "reject"
  | "auto_classify_existing";

const IMAGE_EXTENSION_PATTERN = /\.(avif|webp|jpe?g|png|gif)$/i;
const DIRECTORIES = ["posts"] as const;

type StorageEntry = {
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

async function listMediaObjects() {
  const supabaseAdmin = createSupabaseAdminClient();
  const queue: string[] = [...DIRECTORIES];
  const files: StorageEntry[] = [];

  while (queue.length > 0) {
    const directory = queue.shift();
    if (!directory) continue;
    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin.storage
        .from("media")
        .list(directory, {
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
      if (error) throw new Error(error.message);
      if (!data?.length) break;

      for (const entry of data as StorageEntry[]) {
        const fullPath = `${directory}/${entry.name}`;
        if (entry.metadata === null) queue.push(fullPath);
        else if (IMAGE_EXTENSION_PATTERN.test(fullPath))
          files.push({ ...entry, name: fullPath });
      }

      if (data.length < 100) break;
      offset += data.length;
    }
  }

  return files;
}

async function ensureInventoryRows() {
  if (!isSupabaseAdminConfigured) return 0;
  const [objects, storyRows] = await Promise.all([
    listMediaObjects(),
    db.posts.findMany({
      where: { post_type: "story", media_url: { not: null } },
      select: { media_url: true },
    }),
  ]);
  const storyPaths = new Set(
    storyRows
      .map((row) => row.media_url?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  let inserted = 0;

  for (const object of objects) {
    if (storyPaths.has(object.name)) continue;
    const ownerId =
      object.name.split("/")[1]?.match(/^[0-9a-fA-F-]{36}$/)?.[0] ?? null;
    const title =
      object.name
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "")
        .replace(/[\-_]+/g, " ")
        .trim() || "Untitled capture";

    await db.$executeRaw(Prisma.sql`
      insert into public.gallery_media (image_path, owner_id, title, gallery_type, moderation_status, created_at, updated_at)
      values (${object.name}, ${ownerId}::uuid, ${title}, 'pending', 'pending', ${object.created_at ?? object.updated_at ?? new Date().toISOString()}::timestamptz, now())
      on conflict (image_path) do nothing
    `);
    inserted += 1;
  }

  return inserted;
}

async function loadQueue() {
  const rows = await db.$queryRaw<
    Array<{
      image_path: string;
      owner_id: string | null;
      title: string | null;
      created_at: Date;
      gallery_type: string | null;
      moderation_status: string | null;
      moderation_confidence: string | number | null;
      moderation_reason: string | null;
      contains_person: boolean | null;
      contains_adult_nudity: boolean | null;
      contains_landscape: boolean | null;
      contains_animal: boolean | null;
      contains_vehicle: boolean | null;
      contains_building: boolean | null;
      report_count: number | null;
      username: string | null;
    }>
  >(Prisma.sql`
    select gm.*, p.username
    from public.gallery_media gm
    left join public.profiles p on p.id = gm.owner_id
    where gm.moderation_status = 'pending'
       or gm.gallery_type = 'pending'
    order by gm.report_count desc, gm.updated_at desc
    limit 100
  `);

  const supabaseAdmin = createSupabaseAdminClient();
  const items = await Promise.all(
    rows.map(async (row) => {
      const { data } = await supabaseAdmin.storage
        .from("media")
        .createSignedUrl(row.image_path, 60 * 60, {
          transform: { quality: 70 },
        });

      return {
        imagePath: row.image_path,
        title: row.title ?? "Untitled capture",
        ownerId: row.owner_id,
        username: row.username ?? "unknown",
        createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
        galleryType: parseGalleryType(row.gallery_type),
        moderationStatus: row.moderation_status ?? "pending",
        moderationConfidence: Number(row.moderation_confidence ?? 0),
        moderationReason: row.moderation_reason ?? "Awaiting manual review.",
        reportCount: Number(row.report_count ?? 0),
        metadata: {
          containsPerson: row.contains_person === true,
          containsAdultNudity: row.contains_adult_nudity === true,
          containsLandscape: row.contains_landscape === true,
          containsAnimal: row.contains_animal === true,
          containsVehicle: row.contains_vehicle === true,
          containsBuilding: row.contains_building === true,
        },
        src: data?.signedUrl ?? "",
      };
    }),
  );

  return items;
}

async function loadStats() {
  const [row] = await db.$queryRaw<
    Array<{
      total_uploads: number;
      approved_nude: number;
      approved_general: number;
      pending_review: number;
      rejected: number;
      average_confidence: string | number | null;
    }>
  >(Prisma.sql`
    select
      count(*)::int as total_uploads,
      count(*) filter (where gallery_type = 'nude' and moderation_status = 'approved')::int as approved_nude,
      count(*) filter (where gallery_type = 'general' and moderation_status = 'approved')::int as approved_general,
      count(*) filter (where gallery_type = 'pending' or moderation_status = 'pending')::int as pending_review,
      count(*) filter (where moderation_status = 'rejected')::int as rejected,
      avg(moderation_confidence) as average_confidence
    from public.gallery_media
  `);

  const mostReported = await db.$queryRaw<
    Array<{ image_path: string; report_count: number }>
  >(Prisma.sql`
    select image_path, report_count
    from public.gallery_media
    where report_count > 0
    order by report_count desc, updated_at desc
    limit 5
  `);

  return {
    totalUploads: Number(row?.total_uploads ?? 0),
    approvedNude: Number(row?.approved_nude ?? 0),
    approvedGeneral: Number(row?.approved_general ?? 0),
    pendingReview: Number(row?.pending_review ?? 0),
    rejected: Number(row?.rejected ?? 0),
    averageModerationConfidence: Number(row?.average_confidence ?? 0),
    mostReportedImages: mostReported.map((item) => ({
      imagePath: item.image_path,
      reportCount: Number(item.report_count),
    })),
  };
}

export async function GET(request: NextRequest) {
  const adminResult = await ensureAdminRequest(request);
  if ("error" in adminResult) return adminResult.error;
  if (!isSupabaseAdminConfigured)
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );

  await ensureInventoryRows();
  const [items, stats] = await Promise.all([loadQueue(), loadStats()]);
  return NextResponse.json({ items, stats });
}

export async function POST(request: NextRequest) {
  const adminResult = await ensureAdminRequest(request);
  if ("error" in adminResult) return adminResult.error;

  const body = (await request.json().catch(() => ({}))) as {
    action?: Action;
    imagePath?: string;
    reason?: string;
  };
  const action = body.action;
  const imagePath =
    typeof body.imagePath === "string" ? body.imagePath.trim() : "";
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "Manual moderation update.";

  if (action === "auto_classify_existing") {
    await ensureInventoryRows();
    const pendingRows = await db.$queryRaw<
      Array<{ image_path: string; title: string | null }>
    >(Prisma.sql`
      select image_path, title from public.gallery_media where moderation_status = 'pending' and image_path like 'posts/%' limit 500
    `);

    const supabaseAdmin = createSupabaseAdminClient();

    for (const row of pendingRows) {
      const { data } = await supabaseAdmin.storage
        .from("media")
        .download(row.image_path);
      const personCheck = await detectPersonInImage({
        buffer: data ? Buffer.from(await data.arrayBuffer()) : undefined,
      });
      const decision = classifyPostImageByPersonPresence(personCheck);

      await db.$executeRaw(Prisma.sql`
        update public.gallery_media set
          gallery_type = ${decision.galleryType},
          moderation_status = ${decision.moderationStatus},
          moderation_confidence = ${decision.confidence},
          moderation_reason = ${decision.reason},
          contains_person = ${decision.containsPerson},
          contains_adult_nudity = ${decision.containsAdultNudity},
          contains_landscape = ${decision.containsLandscape},
          contains_animal = ${decision.containsAnimal},
          contains_vehicle = ${decision.containsVehicle},
          contains_building = ${decision.containsBuilding},
          updated_at = now()
        where image_path = ${row.image_path}
      `);
    }

    return NextResponse.json({ ok: true, reviewed: pendingRows.length });
  }

  if (!imagePath || !action)
    return NextResponse.json(
      { error: "Missing moderation action." },
      { status: 400 },
    );

  const nextGallery =
    action === "approve_nude"
      ? "nude"
      : action === "approve_general"
        ? "general"
        : "pending";
  const nextStatus = action === "reject" ? "rejected" : "approved";

  await db.$transaction([
    db.$executeRaw(Prisma.sql`
      update public.gallery_media
      set gallery_type = ${nextGallery},
          moderation_status = ${nextStatus},
          moderation_reason = ${reason},
          reviewed_by = ${adminResult.user.id}::uuid,
          reviewed_at = now(),
          updated_at = now()
      where image_path = ${imagePath}
    `),
    db.$executeRaw(Prisma.sql`
      insert into public.gallery_moderation_audit (image_path, moderator_id, action, reason)
      values (${imagePath}, ${adminResult.user.id}::uuid, ${action}, ${reason})
    `),
  ]);

  return NextResponse.json({ ok: true });
}
