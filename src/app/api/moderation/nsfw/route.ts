import { NextRequest, NextResponse } from "next/server";
import {
  calculateSexualSeverity,
  moderateNsfwScores,
  toNsfwScores,
  inferContextSignals,
  applyBusinessPolicy,
} from "@/lib/nsfw";

export const runtime = "nodejs";

const MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/Falconsai/nsfw_image_detection";

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
      body: buffer,
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
    const formData = await request.formData();
    const file = formData.get("image");

    const userEmail = formData.get("userEmail")?.toString() ?? "";

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

    const buffer = Buffer.from(await file.arrayBuffer());

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

    let payload: any;

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
    const scores = toNsfwScores(payload);

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
      userEmail
    );

    const severity = calculateSexualSeverity(scores, signals);

    return NextResponse.json({
      ...finalModeration,
      sexualSeverity: severity.score,
      sexualSeverityReason: severity.reason,
      inferredSignals: signals,
    });
  } catch (err: any) {
    console.error("FATAL:", err);

    return NextResponse.json(
      { ...FALLBACK, reason: "internal error" },
      { status: 200 }
    );
  }
}