import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  CROSSPOST_OWNER_DISCORD_USER_ID,
  CROSSPOST_OWNER_PROFILE_ID,
  DiscordRegistration,
  getFallbackAuthorId,
  normalizeDiscordId,
  normalizeOptionalString,
  requireIntegrationRequest,
} from "./helpers";

type Attachment = {
  url?: unknown;
  contentType?: unknown;
};

const CROSSPOST_FORUM_ID = process.env.DISCORD_CROSSPOST_FORUM_ID ?? "1515845739870425208";

function buildWebsitePostUrl(postId: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://bareunity.com";
  return `${siteUrl.replace(/\/$/, "")}/?postId=${postId}`;
}

export async function POST(request: Request) {
  const authError = requireIntegrationRequest(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const discordChannelId = normalizeDiscordId(body.discordChannelId);
  const discordThreadId = normalizeDiscordId(body.discordThreadId);
  const discordAuthorId = normalizeDiscordId(body.discordAuthorId);
  const discordAuthorDisplayName = normalizeOptionalString(body.discordAuthorDisplayName, 120) ?? "BareUnity Discord member";
  const discordThreadUrl = normalizeOptionalString(body.discordThreadUrl, 500);
  const title = normalizeOptionalString(body.title, 180) ?? "BareUnity Discord post";
  const rawContent = normalizeOptionalString(body.content, 12000) ?? "";
  const attachments = Array.isArray(body.attachments) ? (body.attachments as Attachment[]) : [];
  const firstImage = attachments.find((attachment) => {
    return typeof attachment.url === "string" && typeof attachment.contentType === "string" && attachment.contentType.startsWith("image/");
  });
  const mediaUrl = typeof firstImage?.url === "string" ? firstImage.url : null;

  if (discordChannelId !== CROSSPOST_FORUM_ID) {
    return NextResponse.json({ error: "This Discord channel is not configured for cross-posting." }, { status: 400 });
  }

  if (!discordThreadId || !discordAuthorId) {
    return NextResponse.json({ error: "Discord thread and author IDs are required." }, { status: 400 });
  }

  if (!rawContent && !mediaUrl) {
    return NextResponse.json({ error: "A Discord post needs content or an image to cross-post." }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();

  const { data: existingSync, error: existingSyncError } = await supabaseAdmin
    .from("discord_reddit_crosspost_sync")
    .select("website_post_id, website_post_url, reddit_url, status")
    .eq("discord_thread_id", discordThreadId)
    .maybeSingle();

  if (existingSyncError) {
    return NextResponse.json({ error: existingSyncError.message }, { status: 500 });
  }

  if (existingSync?.website_post_id) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      websitePostId: existingSync.website_post_id,
      websitePostUrl: existingSync.website_post_url,
      redditUrl: existingSync.reddit_url,
      status: existingSync.status,
    });
  }

  const { data: registration, error: registrationError } = await supabaseAdmin
    .from("discord_crosspost_registrations")
    .select("discord_user_id, discord_username, discord_display_name, bareunity_user_id, enabled")
    .eq("discord_user_id", discordAuthorId)
    .eq("enabled", true)
    .maybeSingle<DiscordRegistration>();

  if (registrationError) {
    return NextResponse.json({ error: registrationError.message }, { status: 500 });
  }

  const isOwnerPost = discordAuthorId === CROSSPOST_OWNER_DISCORD_USER_ID;

  if (!registration && !isOwnerPost) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Discord author is not registered for cross-posting." });
  }

  const authorId = isOwnerPost
    ? CROSSPOST_OWNER_PROFILE_ID
    : registration?.bareunity_user_id ?? (await getFallbackAuthorId(supabaseAdmin));
  const authorMode = isOwnerPost ? "owner_profile" : registration?.bareunity_user_id ? "linked_user" : "fallback_with_disclaimer";
  const content =
    authorMode === "linked_user" || authorMode === "owner_profile"
      ? rawContent
      : [
          "Note: This post was shared by a member of the BareUnity Discord community.",
          `Original Discord author: ${discordAuthorDisplayName}`,
          discordThreadUrl ? `Original Discord thread: ${discordThreadUrl}` : null,
          "",
          rawContent,
        ]
          .filter((line) => line !== null)
          .join("\n");

  const { data: createdPost, error: postError } = await supabaseAdmin
    .from("posts")
    .insert({
      author_id: authorId,
      title,
      content,
      media_url: mediaUrl,
      post_type: mediaUrl ? "image" : "text",
    })
    .select("id")
    .single();

  if (postError || !createdPost?.id) {
    return NextResponse.json({ error: postError?.message ?? "Could not create website post." }, { status: 500 });
  }

  const websitePostId = String(createdPost.id);
  const websitePostUrl = buildWebsitePostUrl(websitePostId);

  const { error: syncError } = await supabaseAdmin.from("discord_reddit_crosspost_sync").upsert(
    {
      discord_thread_id: discordThreadId,
      discord_channel_id: discordChannelId,
      discord_user_id: discordAuthorId,
      website_post_id: websitePostId,
      website_post_url: websitePostUrl,
      author_mode: authorMode,
      status: "website_posted",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "discord_thread_id" },
  );

  if (syncError) {
    console.error("Could not record Discord crosspost sync", syncError);
  }

  return NextResponse.json({
    ok: true,
    websitePostId,
    websitePostUrl,
    authorMode,
  });
}


export async function PATCH(request: Request) {
  const authError = requireIntegrationRequest(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const discordThreadId = normalizeDiscordId(body.discordThreadId);
  if (!discordThreadId) {
    return NextResponse.json({ error: "Discord thread ID is required." }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin
    .from("discord_reddit_crosspost_sync")
    .update({
      reddit_post_id: normalizeOptionalString(body.redditPostId, 200),
      reddit_url: normalizeOptionalString(body.redditUrl, 500),
      status: normalizeOptionalString(body.status, 80) ?? "reddit_posted",
      error: normalizeOptionalString(body.error, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("discord_thread_id", discordThreadId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}