import { NextResponse } from "next/server";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { loadViewerIdFromRequest } from "@/lib/viewer";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

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

export async function POST(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);

    if (!viewerId) {
      return NextResponse.json({ error: "Please sign in before uploading." }, { status: 401 });
    }

    if (!isSupabaseAdminConfigured) {
      return NextResponse.json(
        { error: "Image upload unavailable. Supabase is not configured." },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const upload = formData.get("image");
    if (!(upload instanceof File)) {
      return NextResponse.json({ error: "Please choose an image file to upload." }, { status: 400 });
    }

    const contentType = upload.type.toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Unsupported file type. Please upload an image." }, { status: 400 });
    }

    const extension = getImageExtension(contentType);
    const storagePath = `gallery/${viewerId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const buffer = Buffer.from(await upload.arrayBuffer());
    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.storage.from("media").upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to upload gallery image", error);
    return NextResponse.json({ error: "Gallery upload is unavailable right now." }, { status: 503 });
  }
}