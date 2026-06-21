import { NextResponse } from "next/server";
import { db } from "@/server/db";

import { loadViewerIdFromRequest } from "@/lib/viewer";
import { type HomeFeedPayload } from "@/lib/homefeed";
import {
  buildHomeFeedPayload,
  fallbackFeed,
  getHomeFeedSourceVersion,
} from "@/lib/homefeed-server";
import { readServerCache, writeServerCache } from "@/lib/server-user-cache";
import { UploadValidationError } from "@/lib/upload-security";
import { ensureMemberCanAct } from "@/lib/action-access";
import { classifyPostsBucketImageForGallery } from "@/lib/post-gallery-classification";
import { ensureWebsitePostQueuedForDiscord } from "@/lib/discord-crosspost-sync";

export async function GET(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);
    if (!viewerId) {
      const payload = await buildHomeFeedPayload(null);
      return NextResponse.json(payload);
    }

    const cacheKey = "homefeed:v1";
    let sourceVersion: string | null = null;

    try {
      sourceVersion = await getHomeFeedSourceVersion(viewerId);
      const cached = await readServerCache<HomeFeedPayload>({
        userId: viewerId,
        scope: "homefeed",
        key: cacheKey,
      });

      if (cached && cached.sourceVersion === sourceVersion) {
        return NextResponse.json(cached.value, {
          headers: {
            "x-bareunity-cache": "hit",
            "x-bareunity-cache-version": sourceVersion,
          },
        });
      }
    } catch (cacheReadError) {
      console.warn(
        "Home feed cache read skipped (cache store unavailable)",
        cacheReadError,
      );
    }

    const payload = await buildHomeFeedPayload(viewerId);

    if (sourceVersion) {
      try {
        await writeServerCache({
          userId: viewerId,
          scope: "homefeed",
          key: cacheKey,
          value: payload,
          sourceVersion,
          ttlSeconds: 60 * 15,
        });
      } catch (cacheWriteError) {
        console.warn(
          "Home feed cache write skipped (cache store unavailable)",
          cacheWriteError,
        );
      }
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Unable to load home feed", error);
    return NextResponse.json(fallbackFeed, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);

    if (!viewerId) {
      return NextResponse.json(
        { error: "No profile found to publish as." },
        { status: 400 },
      );
    }

    const actionAccessError = await ensureMemberCanAct(viewerId);
    if (actionAccessError) return actionAccessError;

    const body = (await request.json()) as {
      title?: string;
      content?: string;
      mediaUrl?: string;
      mediaUrls?: string[];
      kind?: "post" | "story";
    };

    const title = body.title?.trim() ?? "";
    const content = body.content?.trim() ?? "";
    const mediaUrls = Array.isArray(body.mediaUrls)
      ? body.mediaUrls.map((url) => url.trim()).filter(Boolean)
      : [];
    const mediaUrl = body.mediaUrl?.trim() ?? "";
    const kind = body.kind === "story" ? "story" : "post";
    const persistedMediaUrls = mediaUrls.length ? mediaUrls : mediaUrl ? [mediaUrl] : [];
    const persistedMediaUrl = persistedMediaUrls[0] ?? "";

    if (kind === "story") {
      if (!persistedMediaUrl) {
        return NextResponse.json(
          { error: "A story image is required." },
          { status: 400 },
        );
      }

      await db.posts.create({
        data: {
          author_id: viewerId,
          title: title || "Story",
          content,
          media_url: persistedMediaUrl,
          media_urls: [persistedMediaUrl],
          post_type: "story",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return NextResponse.json({ ok: true });
    }

    if (!title || (!content && persistedMediaUrls.length === 0)) {
      return NextResponse.json(
        { error: "A title and post content or image are required." },
        { status: 400 },
      );
    }

    const createdPost = await db.posts.create({
      data: {
        author_id: viewerId,
        title,
        content,
        media_url: persistedMediaUrl || null,
        media_urls: persistedMediaUrls,
        post_type: persistedMediaUrls.length ? "image" : "text",
      },
    });

    await ensureWebsitePostQueuedForDiscord(createdPost.id);

    for (const imagePath of persistedMediaUrls) {
      await classifyPostsBucketImageForGallery({
        imagePath,
        ownerId: viewerId,
        title,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Unable to publish to home feed", error);
    return NextResponse.json(
      { error: "Home feed is unavailable right now." },
      { status: 503 },
    );
  }
}
