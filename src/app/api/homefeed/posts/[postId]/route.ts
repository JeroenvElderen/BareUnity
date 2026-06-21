import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { loadViewerIdFromRequest } from "@/lib/viewer";
import { ensureMemberCanAct } from "@/lib/action-access";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import {
  classifyPostsBucketImageForGallery,
  removeImageFromGalleryInventory,
} from "@/lib/post-gallery-classification";

function toStoragePath(pathOrUrl: string | null | undefined): string {
  const value = pathOrUrl?.trim() ?? "";
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
  }

  return value.replace(/^\/+/, "");
}

async function deleteMediaAsset(pathOrUrl: string | null | undefined) {
  const storagePath = toStoragePath(pathOrUrl);
  if (!storagePath || !isSupabaseAdminConfigured) return;

  const supabaseAdmin = createSupabaseAdminClient();

  await Promise.all([
    supabaseAdmin.storage.from("media").remove([storagePath]),
    removeImageFromGalleryInventory(storagePath),
  ]);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);
    if (!viewerId) {
      return NextResponse.json(
        { error: "No profile found for editing posts." },
        { status: 400 },
      );
    }

    const actionAccessError = await ensureMemberCanAct(viewerId);
    if (actionAccessError) return actionAccessError;

    const { postId } = await context.params;
    const body = (await request.json()) as {
      title?: string;
      content?: string;
      mediaUrl?: string;
      mediaUrls?: string[];
    };
    const title = body.title?.trim() ?? "";
    const content = body.content?.trim() ?? "";
    const mediaUrls = Array.isArray(body.mediaUrls)
      ? body.mediaUrls.map((url) => url.trim()).filter(Boolean)
      : [];
    const mediaUrl = body.mediaUrl?.trim() ?? "";
    const persistedMediaUrls = mediaUrls.length ? mediaUrls : mediaUrl ? [mediaUrl] : [];
    if (!title && !content && persistedMediaUrls.length === 0) {
      return NextResponse.json(
        { error: "Updated title, content, or image is required." },
        { status: 400 },
      );
    }

    const post = await db.posts.findUnique({
      where: { id: postId },
      select: { id: true, author_id: true, media_url: true, media_urls: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    if (post.author_id !== viewerId) {
      return NextResponse.json(
        { error: "You can only edit your own posts." },
        { status: 403 },
      );
    }

    const existingMediaUrls = Array.isArray(post.media_urls) ? post.media_urls : [];
    const nextMediaUrls = persistedMediaUrls.length
      ? persistedMediaUrls
      : existingMediaUrls.length
        ? existingMediaUrls
        : post.media_url
          ? [post.media_url]
          : [];
    const nextMediaUrl = nextMediaUrls[0] ?? null;
    await db.posts.update({
      where: { id: postId },
      data: {
        title: title || null,
        content: content || null,
        media_url: nextMediaUrl,
        media_urls: nextMediaUrls,
        post_type: nextMediaUrls.length ? "image" : "text",
      },
    });

    for (const imagePath of persistedMediaUrls) {
      await classifyPostsBucketImageForGallery({
        imagePath,
        ownerId: viewerId,
        title,
      });
    }

    if (persistedMediaUrls.length) {
      const staleMediaUrls = [post.media_url, ...existingMediaUrls]
        .filter((url): url is string => Boolean(url))
        .filter((url, index, urls) => urls.indexOf(url) === index)
        .filter((url) => !persistedMediaUrls.includes(url));

      await Promise.all(staleMediaUrls.map((url) => deleteMediaAsset(url)));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to edit post", error);
    return NextResponse.json(
      { error: "Post editing is unavailable right now." },
      { status: 503 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  const viewerId = await loadViewerIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json(
      { error: "No profile found for deleting posts." },
      { status: 400 },
    );
  }

  const actionAccessError = await ensureMemberCanAct(viewerId);
  if (actionAccessError) return actionAccessError;

  const { postId } = await context.params;

  const post = await db.posts.findUnique({
    where: { id: postId },
    select: { id: true, author_id: true, media_url: true, media_urls: true },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (post.author_id !== viewerId) {
    return NextResponse.json(
      { error: "You can only delete your own posts." },
      { status: 403 },
    );
  }

  await db.posts.delete({ where: { id: postId } });
  const mediaUrls = [post.media_url, ...(Array.isArray(post.media_urls) ? post.media_urls : [])]
    .filter((url): url is string => Boolean(url))
    .filter((url, index, urls) => urls.indexOf(url) === index);
  await Promise.all(mediaUrls.map((url) => deleteMediaAsset(url)));

  return NextResponse.json({ ok: true });
}
