import { Prisma } from "@prisma/client";

import { classifyPostImageByPersonPresence } from "@/lib/gallery-moderation";
import { detectPersonInImage } from "@/lib/person-detection";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { db } from "@/server/db";

function humanizeFileName(path: string) {
  const fileName = path.split("/").pop() ?? "Untitled capture";
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[\-_]+/g, " ")
      .trim() || "Untitled capture"
  );
}

export function isPostsBucketImagePath(path: string) {
  return /^posts\/[^/]+\//.test(path.trim());
}

async function markPostsBucketImageVisibleImmediately(args: {
  imagePath: string;
  ownerId: string;
  title?: string | null;
}) {
  const title = args.title?.trim() || humanizeFileName(args.imagePath);

  await db.$executeRaw(Prisma.sql`
    insert into public.gallery_media (
      image_path,
      owner_id,
      title,
      gallery_type,
      moderation_status,
      moderation_confidence,
      moderation_reason,
      contains_person,
      contains_adult_nudity,
      contains_landscape,
      contains_animal,
      contains_vehicle,
      contains_building,
      updated_at
    ) values (
      ${args.imagePath},
      ${args.ownerId}::uuid,
      ${title},
      'general',
      'approved',
      0,
      'Post image made visible immediately while person-presence routing runs.',
      false,
      false,
      true,
      false,
      false,
      false,
      now()
    )
    on conflict (image_path) do update set
      owner_id = excluded.owner_id,
      title = excluded.title,
      gallery_type = excluded.gallery_type,
      moderation_status = excluded.moderation_status,
      moderation_confidence = excluded.moderation_confidence,
      moderation_reason = excluded.moderation_reason,
      contains_person = excluded.contains_person,
      contains_adult_nudity = excluded.contains_adult_nudity,
      contains_landscape = excluded.contains_landscape,
      contains_animal = excluded.contains_animal,
      contains_vehicle = excluded.contains_vehicle,
      contains_building = excluded.contains_building,
      updated_at = now()
  `);
}

export async function classifyPostsBucketImageForGallery(args: {
  imagePath: string;
  ownerId: string;
  title?: string | null;
}) {
  const imagePath = args.imagePath.trim();
  if (!isSupabaseAdminConfigured || !isPostsBucketImagePath(imagePath)) return;

  await markPostsBucketImageVisibleImmediately({
    imagePath,
    ownerId: args.ownerId,
    title: args.title,
  });

  const supabaseAdmin = createSupabaseAdminClient();
  const { data } = await supabaseAdmin.storage
    .from("media")
    .download(imagePath);
  const personCheck = await detectPersonInImage({
    buffer: data ? Buffer.from(await data.arrayBuffer()) : undefined,
  });
  const decision = classifyPostImageByPersonPresence(personCheck);
  const title = args.title?.trim() || humanizeFileName(imagePath);

  await db.$executeRaw(Prisma.sql`
    insert into public.gallery_media (
      image_path,
      owner_id,
      title,
      gallery_type,
      moderation_status,
      moderation_confidence,
      moderation_reason,
      contains_person,
      contains_adult_nudity,
      contains_landscape,
      contains_animal,
      contains_vehicle,
      contains_building,
      updated_at
    ) values (
      ${imagePath},
      ${args.ownerId}::uuid,
      ${title},
      ${decision.galleryType},
      ${decision.moderationStatus},
      ${decision.confidence},
      ${decision.reason},
      ${decision.containsPerson},
      ${decision.containsAdultNudity},
      ${decision.containsLandscape},
      ${decision.containsAnimal},
      ${decision.containsVehicle},
      ${decision.containsBuilding},
      now()
    )
    on conflict (image_path) do update set
      owner_id = excluded.owner_id,
      title = excluded.title,
      gallery_type = excluded.gallery_type,
      moderation_status = excluded.moderation_status,
      moderation_confidence = excluded.moderation_confidence,
      moderation_reason = excluded.moderation_reason,
      contains_person = excluded.contains_person,
      contains_adult_nudity = excluded.contains_adult_nudity,
      contains_landscape = excluded.contains_landscape,
      contains_animal = excluded.contains_animal,
      contains_vehicle = excluded.contains_vehicle,
      contains_building = excluded.contains_building,
      updated_at = now()
  `);
}

export async function removeImageFromGalleryInventory(imagePath: string) {
  if (!imagePath.trim()) return;

  await db.$transaction([
    db.$executeRaw(
      Prisma.sql`delete from public.gallery_image_likes where image_path = ${imagePath}`,
    ),
    db.$executeRaw(
      Prisma.sql`delete from public.gallery_media where image_path = ${imagePath}`,
    ),
  ]);
}
