import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { type HomeFeedPayload } from "@/lib/homefeed";
import { buildHomeFeedPayload, fallbackFeed, getHomeFeedSourceVersion } from "@/lib/homefeed-server";
import { readServerCache, writeServerCache } from "@/lib/server-user-cache";

const IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

function getImageExtension(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}

async function uploadMediaDataUrl(args: {
  viewerId: string;
  dataUrl: string;
  kind: "post" | "story";
}): Promise<string> {
  if (!isSupabaseAdminConfigured) {
    throw new Error(
      "Image upload unavailable. Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const match = IMAGE_DATA_URL_PATTERN.exec(args.dataUrl);
  if (!match) {
    throw new Error("Invalid image payload. Expected base64 data URL.");
  }

  const [, mimeType, base64Payload] = match;
  const buffer = Buffer.from(base64Payload, "base64");

  if (!buffer.byteLength) {
    throw new Error("Image payload is empty.");
  }

  const extension = getImageExtension(mimeType.toLowerCase());
  const fileName = `${args.viewerId}/${args.kind}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const storagePath = `posts/${fileName}`;
  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.storage.from("media").upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Could not upload image to Supabase Storage: ${error.message}`);
  }

  const { data } = supabaseAdmin.storage.from("media").getPublicUrl(storagePath);
  return data.publicUrl;
}

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
      console.warn("Home feed cache read skipped (cache store unavailable)", cacheReadError);
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
        console.warn("Home feed cache write skipped (cache store unavailable)", cacheWriteError);
      }
    }
  
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Unable to load home feed", error);
    return NextResponse.json(fallbackFeed);
  }
}

export async function POST(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);

    if (!viewerId) {
      return NextResponse.json({ error: "No profile found to publish as." }, { status: 400 });
    }

    const body = (await request.json()) as {
      title?: string;
      content?: string;
      mediaUrl?: string;
      kind?: "post" | "story";
    };

    const title = body.title?.trim() ?? "";
    const content = body.content?.trim() ?? "";
    const mediaUrl = body.mediaUrl?.trim() ?? "";
    const kind = body.kind === "story" ? "story" : "post";
    const hasInlineImage = mediaUrl.startsWith("data:image/");
    const shouldUploadInlineImage = kind === "post" && hasInlineImage;
    const persistedMediaUrl = shouldUploadInlineImage
      ? await uploadMediaDataUrl({ viewerId, dataUrl: mediaUrl, kind })
      : mediaUrl;

    if (kind === "story") {
      if (!persistedMediaUrl) {
        return NextResponse.json({ error: "A story image is required." }, { status: 400 });
      }

      await db.posts.create({
        data: {
          author_id: viewerId,
          title: title || "Story",
          content,
          media_url: persistedMediaUrl,
          post_type: "story",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return NextResponse.json({ ok: true });
    }

    if (!title || (!content && !persistedMediaUrl)) {
      return NextResponse.json({ error: "A title and post content or image are required." }, { status: 400 });
    }

    await db.posts.create({
      data: {
        author_id: viewerId,
        title,
        content,
        media_url: persistedMediaUrl || null,
        post_type: persistedMediaUrl ? "image" : "text",
      },
    });

    return NextResponse.json({ ok: true });
    } catch (error) {
    console.error("Unable to publish to home feed", error);
    return NextResponse.json({ error: "Home feed is unavailable right now." }, { status: 503 });
  }
}
