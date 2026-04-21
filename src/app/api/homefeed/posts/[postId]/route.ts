import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { loadViewerIdFromRequest } from "@/lib/viewer";

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
  const fileName = `${args.viewerId}/post-${Date.now()}-${crypto.randomUUID()}.${extension}`;
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

export async function PATCH(request: Request, context: { params: Promise<{ postId: string }> }) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);
    if (!viewerId) {
      return NextResponse.json({ error: "No profile found for editing posts." }, { status: 400 });
    }

    const { postId } = await context.params;
    const body = (await request.json()) as { title?: string; content?: string; mediaUrl?: string };
    const title = body.title?.trim() ?? "";
    const content = body.content?.trim() ?? "";
    const mediaUrl = body.mediaUrl?.trim() ?? "";
    const hasInlineImage = mediaUrl.startsWith("data:image/");
    const persistedMediaUrl = hasInlineImage ? await uploadMediaDataUrl({ viewerId, dataUrl: mediaUrl }) : "";

    if (!title && !content && !persistedMediaUrl) {
      return NextResponse.json({ error: "Updated title, content, or image is required." }, { status: 400 });
    }

    const post = await db.posts.findUnique({
      where: { id: postId },
      select: { id: true, author_id: true, media_url: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    if (post.author_id !== viewerId) {
      return NextResponse.json({ error: "You can only edit your own posts." }, { status: 403 });
    }

    const nextMediaUrl = persistedMediaUrl || post.media_url || null;
    await db.posts.update({
      where: { id: postId },
      data: {
        title: title || null,
        content: content || null,
        media_url: nextMediaUrl,
        post_type: nextMediaUrl ? "image" : "text",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to edit post", error);
    return NextResponse.json({ error: "Post editing is unavailable right now." }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ postId: string }> }) {
  const viewerId = await loadViewerIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json({ error: "No profile found for deleting posts." }, { status: 400 });
  }

  const { postId } = await context.params;

  const post = await db.posts.findUnique({
    where: { id: postId },
    select: { id: true, author_id: true },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (post.author_id !== viewerId) {
    return NextResponse.json({ error: "You can only delete your own posts." }, { status: 403 });
  }

  await db.posts.delete({ where: { id: postId } });

  return NextResponse.json({ ok: true });
}
