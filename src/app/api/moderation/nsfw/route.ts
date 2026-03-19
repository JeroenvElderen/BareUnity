import { NextRequest, NextResponse } from "next/server";
import { moderateNsfwScores, toNsfwScores } from "@/lib/nsfw";

const MODEL_ID = "strangerguardhf/nsfw_image_detection";
const MODEL_URL = `https://api-inference.huggingface.co/models/${MODEL_ID}`;

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

  const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;

  if (!huggingFaceApiKey) {
    return NextResponse.json(
      {
        decision: "review",
        scores: { pornography: 0, enticingOrSensual: 0, normal: 0 },
        reason: "HUGGINGFACE_API_KEY is not configured",
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
    return NextResponse.json(
      {
        decision: "block",
        scores: { pornography: 0, enticingOrSensual: 0, normal: 0 },
        reason: "Moderation service unavailable. Please try again in a moment.",
        error: "NSFW model request failed",
        detail,
      },
      { status: 422 },
    );
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