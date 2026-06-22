import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireIntegrationRequest, normalizeDiscordId, normalizeOptionalString, findBareUnityProfileByDiscordUserId, getFallbackAuthorId } from "../helpers";
import { buildWebsitePostUrl, DISCORD_DELETE_TARGET, DISCORD_POST_TARGET_CHANNELS, DISCORD_SKIP_TARGET } from "@/lib/discord-crosspost-sync";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

function normalizeTarget(value: unknown) {
  if (value === "photo-sharing") return DISCORD_POST_TARGET_CHANNELS.photoSharing;
  if (value === "naturist-travel") return DISCORD_POST_TARGET_CHANNELS.naturistTravel;
  if (value === DISCORD_SKIP_TARGET) return DISCORD_SKIP_TARGET;
  if (value === DISCORD_DELETE_TARGET || value === "delete") return DISCORD_DELETE_TARGET;
  return normalizeDiscordId(value);
}

const MAX_DISCORD_EVENT_ATTEMPTS = Math.max(1, Number(process.env.DISCORD_CROSSPOST_EVENT_MAX_ATTEMPTS ?? 3));

function normalizeGalleryDecision(value: unknown) {
  if (value === "nude" || value === "nude-gallery" || value === "approve_nude") return "approve_nude";
  if (value === "general" || value === "general-gallery" || value === "approve_general") return "approve_general";
  if (value === "reject" || value === "reject-gallery-image") return "reject";
  return null;
}


async function deletePostEverywhere(websitePostId: string) {
  const syncRows = await db.$queryRaw<
    Array<{
      discord_thread_id: string | null;
      discord_channel_id: string | null;
      target_discord_channel_id: string | null;
      status: string | null;
    }>
  >(Prisma.sql`
    select discord_thread_id, discord_channel_id, target_discord_channel_id, status
    from public.discord_reddit_crosspost_sync
    where website_post_id = ${websitePostId}::uuid
    limit 1
  `);
  const sync = syncRows[0] ?? null;

  await db.$transaction([
    db.comments.deleteMany({ where: { post_id: websitePostId } }),
    db.post_votes.deleteMany({ where: { post_id: websitePostId } }),
    db.posts.deleteMany({ where: { id: websitePostId } }),
  ]);

  await db.$executeRaw(Prisma.sql`
    update public.discord_reddit_crosspost_sync
    set status = 'delete_requested', target_discord_channel_id = null, updated_at = now()
    where website_post_id = ${websitePostId}::uuid
  `);

  return NextResponse.json({
    ok: true,
    deleted: true,
    websitePostId,
    discordThreadId: sync?.discord_thread_id ?? null,
    discordChannelId: sync?.discord_channel_id ?? null,
    targetDiscordChannelId: sync?.target_discord_channel_id ?? null,
  });
}

export async function GET(request: Request) {
  const authError = requireIntegrationRequest(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 25), 1), 100);
  const rows = await db.$queryRaw<Array<{ id: string; website_post_id: string | null; gallery_image_path: string | null; discord_thread_id: string | null; event_type: string; payload: Prisma.JsonValue; dedupe_key: string; created_at: Date }>>(Prisma.sql`
    select id, website_post_id, gallery_image_path, discord_thread_id, event_type, payload, dedupe_key, created_at
    from public.discord_crosspost_events
    where processed_at is null
      and coalesce(attempts, 0) < ${MAX_DISCORD_EVENT_ATTEMPTS}
    order by created_at asc
    limit ${limit}
  `);

  return NextResponse.json({ events: rows });
}

export async function POST(request: Request) {
  const authError = requireIntegrationRequest(request);
  if (authError) return authError;

  const body = (await request.json()) as Record<string, unknown>;
  const action = normalizeOptionalString(body.action, 80);

  if (action === "mark-processed") {
    const eventId = normalizeOptionalString(body.eventId, 80);
    if (!eventId) return NextResponse.json({ error: "eventId is required." }, { status: 400 });
    await db.$executeRaw(Prisma.sql`update public.discord_crosspost_events set processed_at = now(), error = null where id = ${eventId}::uuid`);
    return NextResponse.json({ ok: true });
  }

  if (action === "mark-failed") {
    const eventId = normalizeOptionalString(body.eventId, 80);
    if (!eventId) return NextResponse.json({ error: "eventId is required." }, { status: 400 });
    const terminalFailure = body.terminal === true;
    const result = await db.$queryRaw<Array<{ attempts: number }>>(Prisma.sql`
      update public.discord_crosspost_events
      set error = ${normalizeOptionalString(body.error, 1000)},
          attempts = coalesce(attempts, 0) + 1,
          processed_at = case
            when ${terminalFailure} then now()
            when coalesce(attempts, 0) + 1 >= ${MAX_DISCORD_EVENT_ATTEMPTS} then now()
            else processed_at
          end
      where id = ${eventId}::uuid
      returning attempts
    `);
    return NextResponse.json({
      ok: true,
      attempts: result[0]?.attempts ?? null,
      terminal: terminalFailure || (result[0]?.attempts ?? 0) >= MAX_DISCORD_EVENT_ATTEMPTS,
    });
  }

  if (action === "delete-post") {
    const websitePostId = normalizeOptionalString(body.websitePostId, 80);
    if (!websitePostId) return NextResponse.json({ error: "websitePostId is required." }, { status: 400 });
    return deletePostEverywhere(websitePostId);
  }

  if (action === "post-decision") {
    const websitePostId = normalizeOptionalString(body.websitePostId, 80);
    const target = normalizeTarget(body.target);
    if (!websitePostId || !target) return NextResponse.json({ error: "websitePostId and target are required." }, { status: 400 });

    if (target === DISCORD_SKIP_TARGET) {
      await db.$executeRaw(Prisma.sql`
        update public.discord_reddit_crosspost_sync
        set status = 'discord_skipped', target_discord_channel_id = null, updated_at = now()
        where website_post_id = ${websitePostId}::uuid
      `);
      return NextResponse.json({ ok: true, skipped: true });
    }

    if (target === DISCORD_DELETE_TARGET) {
      return deletePostEverywhere(websitePostId);
    }

    await db.$executeRaw(Prisma.sql`
      update public.discord_reddit_crosspost_sync
      set status = 'approved_for_discord', target_discord_channel_id = ${target}, updated_at = now()
      where website_post_id = ${websitePostId}::uuid
    `);
    return NextResponse.json({ ok: true, targetDiscordChannelId: target });
  }

  if (action === "gallery-decision") {
    const imagePath = normalizeOptionalString(body.imagePath, 500);
    const decision = normalizeGalleryDecision(body.target ?? body.decision);
    const reason =
      normalizeOptionalString(body.reason, 1000) ??
      "Discord gallery review decision.";

    if (!imagePath || !decision) {
      return NextResponse.json(
        { error: "imagePath and a nude/general/reject decision are required." },
        { status: 400 },
      );
    }

    const nextGallery =
      decision === "approve_nude"
        ? "nude"
        : decision === "approve_general"
          ? "general"
          : "pending";
    const nextStatus = decision === "reject" ? "rejected" : "approved";

    const discordReviewThreadId = normalizeDiscordId(body.discordReviewThreadId ?? body.discordThreadId);
    const discordReviewerId = normalizeDiscordId(body.discordReviewerId ?? body.discordUserId);
    const bucketId = normalizeOptionalString(body.bucketId, 120) ?? "user-media";

    if (decision === "reject" && isSupabaseAdminConfigured) {
      const supabaseAdmin = createSupabaseAdminClient();
      const { error } = await supabaseAdmin.storage.from(bucketId).remove([imagePath]);
      if (error) {
        console.error("Discord gallery review could not delete rejected image", { imagePath, bucketId, error });
      }
    }

    await db.$transaction([
      db.$executeRaw(Prisma.sql`
        update public.gallery_media
        set gallery_type = ${nextGallery},
            moderation_status = ${nextStatus},
            moderation_reason = ${reason},
            reviewed_at = now(),
            updated_at = now(),
            discord_review_status = 'done',
            discord_review_thread_id = coalesce(${discordReviewThreadId}, discord_review_thread_id),
            discord_reviewer_id = coalesce(${discordReviewerId}, discord_reviewer_id)
        where image_path = ${imagePath}
      `),
      db.$executeRaw(Prisma.sql`
        insert into public.gallery_moderation_audit (image_path, moderator_id, action, reason, discord_user_id, discord_thread_id)
        values (${imagePath}, null, ${decision}, ${reason}, ${discordReviewerId}, ${discordReviewThreadId})
      `),
    ]);

    return NextResponse.json({
      ok: true,
      imagePath,
      galleryType: nextGallery,
      moderationStatus: nextStatus,
      deleteDiscordThreadId: discordReviewThreadId,
      rejectedStorageDeleted: decision === "reject",
    });
  }

  if (action === "gallery-thread-created") {
    const imagePath = normalizeOptionalString(body.imagePath, 500);
    const discordThreadId = normalizeDiscordId(body.discordThreadId);
    const discordChannelId = normalizeDiscordId(body.discordChannelId);
    const discordMessageId = normalizeDiscordId(body.discordMessageId);
    if (!imagePath || !discordThreadId || !discordChannelId) {
      return NextResponse.json({ error: "imagePath, discordThreadId, and discordChannelId are required." }, { status: 400 });
    }

    await db.$executeRaw(Prisma.sql`
      update public.gallery_media
      set discord_review_thread_id = ${discordThreadId},
          discord_review_channel_id = ${discordChannelId},
          discord_review_message_id = ${discordMessageId},
          discord_review_status = 'posted',
          updated_at = now()
      where image_path = ${imagePath}
    `);
    return NextResponse.json({ ok: true });
  }

  if (action === "thread-created") {
    const websitePostId = normalizeOptionalString(body.websitePostId, 80);
    const discordThreadId = normalizeDiscordId(body.discordThreadId);
    const discordChannelId = normalizeDiscordId(body.discordChannelId);
    if (!websitePostId || !discordThreadId || !discordChannelId) {
      return NextResponse.json({ error: "websitePostId, discordThreadId, and discordChannelId are required." }, { status: 400 });
    }

    await db.$executeRaw(Prisma.sql`
      insert into public.discord_reddit_crosspost_sync (website_post_id, website_post_url, discord_thread_id, discord_channel_id, target_discord_channel_id, status, author_mode, updated_at)
      values (${websitePostId}::uuid, ${buildWebsitePostUrl(websitePostId)}, ${discordThreadId}, ${discordChannelId}, ${discordChannelId}, 'discord_thread_created', 'website_user', now())
      on conflict (website_post_id) do update set discord_thread_id = excluded.discord_thread_id, discord_channel_id = excluded.discord_channel_id, target_discord_channel_id = excluded.target_discord_channel_id, status = excluded.status, updated_at = now()
    `);
    return NextResponse.json({ ok: true });
  }


  if (action === "discord-comment-created") {
    const discordThreadId = normalizeDiscordId(body.discordThreadId);
    const discordMessageId = normalizeDiscordId(body.discordMessageId);
    const discordAuthorId = normalizeDiscordId(body.discordAuthorId);
    const content = normalizeOptionalString(body.content, 12000);
    if (!discordThreadId || !discordMessageId || !discordAuthorId || !content) {
      return NextResponse.json({ error: "discordThreadId, discordMessageId, discordAuthorId, and content are required." }, { status: 400 });
    }

    const syncRows = await db.$queryRaw<Array<{ website_post_id: string }>>(Prisma.sql`
      select website_post_id from public.discord_reddit_crosspost_sync
      where discord_thread_id = ${discordThreadId} and website_post_id is not null
      limit 1
    `);
    const websitePostId = syncRows[0]?.website_post_id;
    if (!websitePostId) return NextResponse.json({ error: "No linked website post for that Discord thread." }, { status: 404 });

    const existing = await db.$queryRaw<Array<{ website_comment_id: string | null }>>(Prisma.sql`
      select website_comment_id from public.discord_crosspost_comment_sync
      where discord_message_id = ${discordMessageId}
      limit 1
    `);
    if (existing[0]?.website_comment_id) return NextResponse.json({ ok: true, duplicate: true, commentId: existing[0].website_comment_id });

    const supabaseAdmin = (await import("@/lib/supabase-admin")).createSupabaseAdminClient();
    const linkedProfile = await findBareUnityProfileByDiscordUserId(supabaseAdmin, discordAuthorId);
    const authorId = linkedProfile?.id ?? (await getFallbackAuthorId(supabaseAdmin));
    const comment = await db.comments.create({ data: { post_id: websitePostId, author_id: authorId, content } });

    await db.$executeRaw(Prisma.sql`
      insert into public.discord_crosspost_comment_sync (website_post_id, website_comment_id, discord_thread_id, discord_message_id, discord_user_id)
      values (${websitePostId}::uuid, ${comment.id}::uuid, ${discordThreadId}, ${discordMessageId}, ${discordAuthorId})
      on conflict (discord_message_id) do nothing
    `);
    return NextResponse.json({ ok: true, commentId: comment.id });
  }

  if (action === "discord-like-created" || action === "discord-like-removed") {
    const discordThreadId = normalizeDiscordId(body.discordThreadId);
    const discordUserId = normalizeDiscordId(body.discordUserId);
    if (!discordThreadId || !discordUserId) return NextResponse.json({ error: "discordThreadId and discordUserId are required." }, { status: 400 });
    const syncRows = await db.$queryRaw<Array<{ website_post_id: string }>>(Prisma.sql`
      select website_post_id from public.discord_reddit_crosspost_sync
      where discord_thread_id = ${discordThreadId} and website_post_id is not null
      limit 1
    `);
    const websitePostId = syncRows[0]?.website_post_id;
    if (!websitePostId) return NextResponse.json({ error: "No linked website post for that Discord thread." }, { status: 404 });
    const supabaseAdmin = (await import("@/lib/supabase-admin")).createSupabaseAdminClient();
    const linkedProfile = await findBareUnityProfileByDiscordUserId(supabaseAdmin, discordUserId);
    const voterId = linkedProfile?.id ?? (await getFallbackAuthorId(supabaseAdmin));

    if (action === "discord-like-removed") {
      await db.post_votes.deleteMany({ where: { post_id: websitePostId, user_id: voterId } });
    } else {
      await db.post_votes.upsert({
        where: { post_id_user_id: { post_id: websitePostId, user_id: voterId } },
        update: { vote: 1, updated_at: new Date() },
        create: { post_id: websitePostId, user_id: voterId, vote: 1 },
      });
    }
    const likes = await db.post_votes.count({ where: { post_id: websitePostId, vote: { gt: 0 } } });
    return NextResponse.json({ ok: true, likes });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
