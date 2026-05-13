import { NextRequest, NextResponse } from "next/server";

import { ensureMemberCanAct } from "@/lib/action-access";
import { ensureAuthenticatedRequest } from "@/lib/request-auth";
import {
  IMAGE_UPLOAD_EXTENSION_BY_TYPE,
  IMAGE_UPLOAD_TYPES,
  UploadValidationError,
  validateFileUpload,
} from "@/lib/upload-security";
import {
  calculateSexualSeverity,
  moderateNsfwScores,
  toNsfwScores,
  inferContextSignals,
  applyBusinessPolicy,
  type HuggingFaceNsfwEntry,
} from "@/lib/nsfw";

export const runtime = "nodejs";

const MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/Falconsai/nsfw_image_detection";

const MAX_MODERATION_IMAGE_BYTES = 8 * 1024 * 1024;

const FALLBACK = {
  decision: "review" as const,
  scores: { pornography: 0, enticingOrSensual: 0, normal: 0 },
};

async function callHF(apiKey: string, buffer: Buffer) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(buffer),
      signal: controller.signal,
    });

    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function getModelResponse(apiKey: string, buffer: Buffer) {
  for (let i = 0; i < 2; i++) {
    try {
      const text = await callHF(apiKey, buffer);

      if (!text) continue;

      if (text.toLowerCase().includes("loading")) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      return text;
    } catch {
      if (i === 1) throw new Error("HF failed after retry");
    }
  }

  throw new Error("HF failed");
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await ensureAuthenticatedRequest(request);
    if ("error" in authResult) return authResult.error;

    const actionAccessError = await ensureMemberCanAct(authResult.user.id);
    if (actionAccessError) return actionAccessError;

    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "image required" },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN;

    if (!apiKey) {
      return NextResponse.json(
        { ...FALLBACK, reason: "missing api key" },
        { status: 200 }
      );
    }

    let buffer: Buffer;

    try {
      const validatedUpload = await validateFileUpload(file, {
        allowedTypes: IMAGE_UPLOAD_TYPES,
        extensionByType: IMAGE_UPLOAD_EXTENSION_BY_TYPE,
        maxBytes: MAX_MODERATION_IMAGE_BYTES,
        emptyMessage: "Image is empty.",
        typeMessage: "Unsupported image type.",
        sizeMessage: "Image must be 8MB or smaller.",
        signatureMessage: "Image contents do not match the declared file type.",
      });
      buffer = validatedUpload.buffer;
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    let text: string;

    try {
      text = await getModelResponse(apiKey, buffer);
    } catch (err) {
      console.error("HF FAILED:", err);

      return NextResponse.json(
        { ...FALLBACK, reason: "model unavailable" },
        { status: 200 }
      );
    }

    console.log("HF RAW:", text.slice(0, 200));

    const trimmed = text.trim();

    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return NextResponse.json(
        { ...FALLBACK, reason: "non-json response" },
        { status: 200 }
      );
    }

    let payload: unknown;

    try {
      payload = JSON.parse(trimmed);
    } catch {
      return NextResponse.json(
        { ...FALLBACK, reason: "json parse failed" },
        { status: 200 }
      );
    }

    if (!Array.isArray(payload)) {
      return NextResponse.json(
        { ...FALLBACK, reason: "invalid payload shape" },
        { status: 200 }
      );
    }

    // ✅ Stage 1
    const scores = toNsfwScores(payload as HuggingFaceNsfwEntry[]);

    // ✅ Stage 2
    const signals = inferContextSignals(scores);

    // ✅ Stage 3
    const moderation = moderateNsfwScores(scores, {
      allowExplicit: false,
      signals,
    });

    // 🔥 Stage 4 (NEW): business policy
    const finalModeration = applyBusinessPolicy(
      moderation,
      scores,
      signals,
    );

    const severity = calculateSexualSeverity(scores, signals);

    return NextResponse.json({
      ...finalModeration,
      sexualSeverity: severity.score,
      sexualSeverityReason: severity.reason,
      inferredSignals: signals,
    });
  } catch (err: unknown) {
    console.error("FATAL:", err);

    return NextResponse.json(
      { ...FALLBACK, reason: "internal error" },
      { status: 200 }
    );
  }
}