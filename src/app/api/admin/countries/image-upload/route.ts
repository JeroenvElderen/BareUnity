import { type NextRequest, NextResponse } from "next/server";

import { ensureAdminRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { ensureMediaBucket } from "@/lib/storage-buckets";

const MAX_COUNTRY_IMAGE_SIZE = 15 * 1024 * 1024;
const ALLOWED_COUNTRY_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

function pathSegment(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function extensionFromFile(file: File) {
  const nameExtension = file.name.split(".").pop()?.toLowerCase();
  if (nameExtension && /^[a-z0-9]+$/.test(nameExtension)) return nameExtension;

  return file.type.split("/").pop()?.replace("jpeg", "jpg") ?? "jpg";
}

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const authResult = await ensureAdminRequest(request);
  if ("error" in authResult) return authResult.error;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const continent = formData?.get("continent");
  const country = formData?.get("country");
  const slot = formData?.get("slot");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }

  if (typeof continent !== "string" || typeof country !== "string") {
    return NextResponse.json({ error: "Continent and country are required." }, { status: 400 });
  }

  if (!ALLOWED_COUNTRY_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Upload a JPEG, PNG, WebP, GIF, or AVIF image." }, { status: 400 });
  }

  if (file.size > MAX_COUNTRY_IMAGE_SIZE) {
    return NextResponse.json({ error: "Country images must be 15 MB or smaller." }, { status: 400 });
  }

  const continentPath = pathSegment(continent);
  const countryPath = pathSegment(country);
  if (!continentPath || !countryPath) {
    return NextResponse.json({ error: "Enter a valid continent and country before uploading." }, { status: 400 });
  }

  const safeSlot = pathSegment(typeof slot === "string" ? slot : "country-image") || "country-image";
  const filePath = `Continent/${continentPath}/${countryPath}/${safeSlot}-${Date.now()}.${extensionFromFile(file)}`;
  const supabaseAdmin = createSupabaseAdminClient();

  try {
    await ensureMediaBucket(supabaseAdmin);

    const { error: uploadError } = await supabaseAdmin.storage
      .from("media")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabaseAdmin.storage.from("media").getPublicUrl(filePath);
    return NextResponse.json({ bucketId: "media", path: filePath, publicUrl: data.publicUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload country image." },
      { status: 500 },
    );
  }
}
