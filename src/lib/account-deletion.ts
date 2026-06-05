import { Prisma } from "@prisma/client";

import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { db } from "@/server/db";

type StorageListEntry = {
  name: string;
  metadata?: Record<string, unknown> | null;
};

function toStoragePath(pathOrUrl: string | null | undefined): string {
  const value = pathOrUrl?.trim();
  if (!value) return "";

  if (value.startsWith("http")) {
    try {
      const pathname = new URL(value).pathname;
      const mediaPublicPrefix = "/storage/v1/object/public/media/";
      const mediaPrivatePrefix = "/storage/v1/object/media/";
      const mediaSignPrefix = "/storage/v1/object/sign/media/";

      if (pathname.includes(mediaPublicPrefix)) {
        return decodeURIComponent(pathname.split(mediaPublicPrefix)[1] ?? "");
      }

      if (pathname.includes(mediaPrivatePrefix)) {
        return decodeURIComponent(pathname.split(mediaPrivatePrefix)[1] ?? "");
      }

      if (pathname.includes(mediaSignPrefix)) {
        return decodeURIComponent(pathname.split(mediaSignPrefix)[1] ?? "");
      }
    } catch {
      return "";
    }

    return "";
  }

  return value.replace(/^\/+/, "");
}

async function listStorageFiles(bucket: string, prefix: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const queue = [prefix.replace(/\/$/, "")];
  const files: string[] = [];

  while (queue.length > 0) {
    const directory = queue.shift();
    if (!directory) continue;

    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .list(directory, {
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        });

      if (error || !data?.length) break;

      for (const entry of data as StorageListEntry[]) {
        const fullPath = `${directory}/${entry.name}`;
        if (entry.metadata === null) {
          queue.push(fullPath);
        } else {
          files.push(fullPath);
        }
      }

      if (data.length < 100) break;
      offset += data.length;
    }
  }

  return files;
}

async function removeStorageFiles(bucket: string, paths: string[]) {
  if (paths.length === 0) return;

  const supabaseAdmin = createSupabaseAdminClient();
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));

  for (let index = 0; index < uniquePaths.length; index += 100) {
    const chunk = uniquePaths.slice(index, index + 100);
    if (chunk.length === 0) continue;
    await supabaseAdmin.storage.from(bucket).remove(chunk);
  }
}

async function loadExistingPublicTables(tableNames: string[]) {
  const rows = await db.$queryRaw<Array<{ table_name: string }>>(Prisma.sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (${Prisma.join(tableNames)})
  `);

  return new Set(rows.map((row) => row.table_name));
}

type DirectUserReference = {
  table_name: string;
  column_name: string;
  is_nullable: "YES" | "NO";
};

const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdentifier(identifier: string) {
  if (!SQL_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(
      `Unsafe SQL identifier discovered during account deletion: ${identifier}`,
    );
  }

  return `"${identifier}"`;
}

async function cleanupRemainingAuthUserReferences(userId: string) {
  const references = await db.$queryRaw<DirectUserReference[]>(Prisma.sql`
    select
      kcu.table_name,
      kcu.column_name,
      columns.is_nullable
    from information_schema.table_constraints constraints
    join information_schema.key_column_usage kcu
      on kcu.constraint_schema = constraints.constraint_schema
     and kcu.constraint_name = constraints.constraint_name
     and kcu.table_schema = constraints.table_schema
     and kcu.table_name = constraints.table_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema = constraints.constraint_schema
     and ccu.constraint_name = constraints.constraint_name
    join information_schema.columns columns
      on columns.table_schema = kcu.table_schema
     and columns.table_name = kcu.table_name
     and columns.column_name = kcu.column_name
    where constraints.constraint_type = 'FOREIGN KEY'
      and kcu.table_schema = 'public'
      and ccu.table_schema = 'auth'
      and ccu.table_name = 'users'
      and ccu.column_name = 'id'
      and kcu.table_name not in ('profiles', 'profile_settings')
  `);

  for (const reference of references) {
    const tableName = quoteIdentifier(reference.table_name);
    const columnName = quoteIdentifier(reference.column_name);

    if (reference.is_nullable === "YES") {
      await db.$executeRawUnsafe(
        `update public.${tableName} set ${columnName} = null where ${columnName} = $1::uuid`,
        userId,
      );
    } else {
      await db.$executeRawUnsafe(
        `delete from public.${tableName} where ${columnName} = $1::uuid`,
        userId,
      );
    }
  }
}

export async function deleteAccountCompletely(userId: string) {
  if (!isSupabaseAdminConfigured) {
    return {
      ok: false as const,
      status: 503,
      error:
        "Account deletion is unavailable because Supabase admin access is not configured.",
    };
  }

  const [profile, settings, postMediaRows] = await Promise.all([
    db.profiles.findUnique({
      where: { id: userId },
      select: { avatar_url: true },
    }),
    db.profile_settings.findUnique({
      where: { user_id: userId },
      select: { avatar_url: true, banner_url: true },
    }),
    db.posts.findMany({
      where: { author_id: userId, media_url: { not: null } },
      select: { media_url: true },
    }),
  ]);

  const mediaPaths = Array.from(
    new Set(
      [
        profile?.avatar_url,
        settings?.avatar_url,
        settings?.banner_url,
        ...postMediaRows.map((row) => row.media_url),
      ]
        .map(toStoragePath)
        .filter(Boolean),
    ),
  );

  const [galleryFiles, avatarFiles, verificationFiles] = await Promise.all([
    listStorageFiles("media", `gallery/${userId}`),
    listStorageFiles("media", `avatars/${userId}`),
    listStorageFiles("verification-documents", userId),
  ]);

  await Promise.all([
    removeStorageFiles("media", [
      ...mediaPaths,
      ...galleryFiles,
      ...avatarFiles,
    ]),
    removeStorageFiles("verification-documents", verificationFiles),
  ]);

  const postMediaPaths = mediaPaths.filter((path) => path.startsWith("posts/"));
  const existingTables = await loadExistingPublicTables([
    "channel_messages",
    "channels",
    "comments",
    "dm_messages",
    "dm_conversations",
    "events",
    "feedback_messages",
    "friend_requests",
    "friendships",
    "gallery_image_likes",
    "naturist_map_spots",
    "post_votes",
    "posts",
    "profile_settings",
    "profiles",
    "registration_invite_code_redemptions",
    "registration_invite_codes",
    "reports",
    "user_badges",
    "user_cache_entries",
    "verification_submissions",
  ]);

  const hasTable = (tableName: string) => existingTables.has(tableName);

  await db.$transaction([
    ...(hasTable("reports")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.reports
            where reporter_id = ${userId}::uuid
              ${hasTable("posts") ? Prisma.sql`or post_id in (select id from public.posts where author_id = ${userId}::uuid)` : Prisma.empty}
              ${hasTable("comments") ? Prisma.sql`or comment_id in (select id from public.comments where author_id = ${userId}::uuid)` : Prisma.empty}
              or target_id = ${userId}
              or target_id like ${`gallery/${userId}/%`}
          `),
        ]
      : []),
    ...(hasTable("gallery_image_likes")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.gallery_image_likes
            where user_id = ${userId}::uuid
              or image_path like ${`gallery/${userId}/%`}
              or image_path like ${`%/gallery/${userId}/%`}
              ${postMediaPaths.length ? Prisma.sql`or image_path in (${Prisma.join(postMediaPaths)})` : Prisma.empty}
          `),
        ]
      : []),
    ...(hasTable("comments") && hasTable("reports")
      ? [
          db.$executeRaw(Prisma.sql`
            with recursive doomed_comments as (
              select id from public.comments where author_id = ${userId}::uuid
              union
              select child.id
              from public.comments child
              inner join doomed_comments parent on child.parent_id = parent.id
            )
            delete from public.reports
            where comment_id in (select id from doomed_comments)
          `),
        ]
      : []),
    ...(hasTable("comments")
      ? [
          db.$executeRaw(Prisma.sql`
            with recursive doomed_comments as (
              select id from public.comments where author_id = ${userId}::uuid
              union
              select child.id
              from public.comments child
              inner join doomed_comments parent on child.parent_id = parent.id
            )
            delete from public.comments
            where id in (select id from doomed_comments)
          `),
        ]
      : []),
    ...(hasTable("post_votes")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.post_votes
            where user_id = ${userId}::uuid
              ${hasTable("posts") ? Prisma.sql`or post_id in (select id from public.posts where author_id = ${userId}::uuid)` : Prisma.empty}
          `),
        ]
      : []),
    ...(hasTable("friend_requests")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.friend_requests
            where sender_id = ${userId}::uuid or receiver_id = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("friendships")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.friendships
            where user_id = ${userId}::uuid or friend_user_id = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("channel_messages")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.channel_messages where author_id = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("events")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.events where organizer_id = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("naturist_map_spots")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.naturist_map_spots where submitted_by = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("channels")
      ? [
          db.$executeRaw(Prisma.sql`
            update public.channels set created_by = null where created_by = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("posts")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.posts where author_id = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("user_badges")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.user_badges where user_id = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("user_cache_entries")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.user_cache_entries where user_id = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("verification_submissions")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.verification_submissions where user_id = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("dm_messages") && hasTable("dm_conversations")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.dm_messages
            where sender_id = ${userId}::uuid
              or conversation_id in (
                select id from public.dm_conversations
                where user_a = ${userId}::uuid or user_b = ${userId}::uuid
              )
          `),
        ]
      : []),
    ...(hasTable("dm_conversations")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.dm_conversations
            where user_a = ${userId}::uuid or user_b = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("feedback_messages")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.feedback_messages where user_id = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("registration_invite_code_redemptions")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.registration_invite_code_redemptions where redeemed_by = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("registration_invite_codes")
      ? [
          db.$executeRaw(Prisma.sql`
            update public.registration_invite_codes set created_by = null where created_by = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("profile_settings")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.profile_settings where user_id = ${userId}::uuid
          `),
        ]
      : []),
    ...(hasTable("profiles")
      ? [
          db.$executeRaw(Prisma.sql`
            delete from public.profiles where id = ${userId}::uuid
          `),
        ]
      : []),
  ]);

  await cleanupRemainingAuthUserReferences(userId);

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    return { ok: false as const, status: 500, error: error.message };
  }

  return { ok: true as const };
}
