import { NextRequest, NextResponse } from "next/server";
import { moderateNsfwScores, toNsfwScores } from "@/lib/nsfw";

const MODEL_ID = "strangerguardhf/nsfw_image_detection";
const MODEL_URL = `https://api-inference.huggingface.co/models/${MODEL_ID}`;
const FAIL_OPEN = process.env.NODE_ENV !== "production" || process.env.NSFW_FAIL_OPEN === "1";

function unavailableResponse(detail?: string) {
  return NextResponse.json(
    {
      decision: FAIL_OPEN ? "allow" : "block",
      scores: { pornography: 0, enticingOrSensual: 0, normal: 0 },
      reason: FAIL_OPEN
        ? "Moderation service unavailable. Allowed in fail-open mode."
        : "Moderation service unavailable. Please try again in a moment.",
      error: "NSFW model request failed",
      detail,
    },
    { status: FAIL_OPEN ? 200 : 422 },
  );
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const maybeFile = formData.get("image");
  const allowExplicit = formData.get("allowExplicit") === "1";

  if (!(maybeFile instanceof File)) {
    return NextResponse.json({ error: "image file is required" }, { status: 400 });
  }

  if (!maybeFile.type.startsWith("image/")) {
    return NextResponse.json({ error: "only image uploads are supported" }, { status: 400 });
  }

  const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN;

  if (!huggingFaceApiKey) {
    return NextResponse.json(
      {
        decision: FAIL_OPEN ? "allow" : "review",
        scores: { pornography: 0, enticingOrSensual: 0, normal: 0 },
        reason: "Set HUGGINGFACE_API_KEY or HF_TOKEN to enable StrangerGuard moderation",
      },
      { status: 200 },
    );
  }

  const response = await fetch(MODEL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${huggingFaceApiKey}`,
      "Content-Type": maybeFile.type,
    },
    body: Buffer.from(await maybeFile.arrayBuffer()),
  });

  if (!response.ok) {
    const detail = await response.text();
    return unavailableResponse(detail);
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    return NextResponse.json(
      {
        decision: "block",
        scores: { pornography: 0, enticingOrSensual: 0, normal: 0 },
        reason: "Moderation service returned an invalid response.",
        error: "unexpected NSFW model response",
        payload,
      },
      { status: 422 },
    );
  }

  const scoreInput = payload
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;

      const label = "label" in entry ? entry.label : null;
      const score = "score" in entry ? entry.score : null;

      if (typeof label !== "string" || typeof score !== "number") {
        return null;
      }

      return { label, score };
    })
    .filter((entry): entry is { label: string; score: number } => entry !== null);

  if (!scoreInput.length) {
    return NextResponse.json(
      {
        decision: "block",
        scores: { pornography: 0, enticingOrSensual: 0, normal: 0 },
        reason: "Moderation service did not return usable scores.",
        error: "no usable scores returned from model",
        payload,
      },
      { status: 422 },
    );
  }

  const scores = toNsfwScores(scoreInput);
  const moderation = moderateNsfwScores(scores, { allowExplicit });

  return NextResponse.json(moderation, { status: moderation.decision === "block" ? 422 : 200 });
}