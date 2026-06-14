import { type NextRequest, NextResponse } from "next/server";

import { ensureAdminRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { ensureMediaBucket } from "@/lib/storage-buckets";
import {
  IMAGE_UPLOAD_EXTENSION_BY_TYPE,
  IMAGE_UPLOAD_TYPES,
} from "@/lib/upload-security";

const MAX_COUNTRY_IMAGE_SIZE = 15 * 1024 * 1024;

type CountryImageUploadRequestBody = {
  fileName?: unknown;
  contentType?: unknown;
  size?: unknown;
  continent?: unknown;
  country?: unknown;
  slot?: unknown;
};

function pathSegment(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function cleanFileBaseName(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "country-image";
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

  const body = (await request.json().catch(() => null)) as CountryImageUploadRequestBody | null;
  const contentType = typeof body?.contentType === "string" ? body.contentType.toLowerCase() : "";
  const fileName = typeof body?.fileName === "string" ? body.fileName : "country-image";
  const size = typeof body?.size === "number" ? body.size : 0;
  const continent = body?.continent;
  const country = body?.country;
  const slot = body?.slot;

  if (typeof continent !== "string" || typeof country !== "string") {
    return NextResponse.json({ error: "Continent and country are required." }, { status: 400 });
  }

  if (!IMAGE_UPLOAD_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Upload a JPEG, PNG, WebP, GIF, or AVIF image." }, { status: 400 });
  }

  if (!size || size > MAX_COUNTRY_IMAGE_SIZE) {
    return NextResponse.json(
      { error: "Country images must be 15 MB or smaller." },
      { status: size > MAX_COUNTRY_IMAGE_SIZE ? 413 : 400 },
    );
  }

  const continentPath = pathSegment(continent);
  const countryPath = pathSegment(country);
  if (!continentPath || !countryPath) {
    return NextResponse.json({ error: "Enter a valid continent and country before uploading." }, { status: 400 });
  }

  const safeSlot = pathSegment(typeof slot === "string" ? slot : "country-image") || "country-image";
  const extension = IMAGE_UPLOAD_EXTENSION_BY_TYPE[contentType] ?? "bin";
  const filePath = `Continent/${continentPath}/${countryPath}/${safeSlot}-${Date.now()}-${crypto.randomUUID()}-${cleanFileBaseName(fileName)}.${extension}`;
  const supabaseAdmin = createSupabaseAdminClient();

  try {
    await ensureMediaBucket(supabaseAdmin);

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("media")
      .createSignedUploadUrl(filePath, {
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabaseAdmin.storage.from("media").getPublicUrl(filePath);
    return NextResponse.json({
      bucketId: "media",
      path: filePath,
      publicUrl: data.publicUrl,
      token: uploadData.token,
      signedUrl: uploadData.signedUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload country image." },
      { status: 500 },
    );
  }
}
