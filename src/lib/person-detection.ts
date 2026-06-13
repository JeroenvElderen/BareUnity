const PERSON_DETECTION_MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/facebook/detr-resnet-50";
const PERSON_DETECTION_TIMEOUT_MS = 8000;
const PERSON_CONFIDENCE_THRESHOLD = 0.55;

export type PersonDetectionResult = {
  containsPerson: boolean;
  confidence: number;
  reason: string;
  source: "model" | "unavailable";
};

type HuggingFaceObjectDetectionEntry = {
  label?: unknown;
  score?: unknown;
};

function parseDetectionPayload(payload: unknown): PersonDetectionResult {
  if (!Array.isArray(payload)) {
    return {
      containsPerson: false,
      confidence: 0,
      reason: "Person detector returned an unsupported payload shape.",
      source: "unavailable",
    };
  }

  const personScores = payload
    .map((entry) => entry as HuggingFaceObjectDetectionEntry)
    .filter((entry) => String(entry.label ?? "").toLowerCase() === "person")
    .map((entry) => Number(entry.score ?? 0))
    .filter((score) => Number.isFinite(score));
  const confidence = Math.max(0, ...personScores);

  return {
    containsPerson: confidence >= PERSON_CONFIDENCE_THRESHOLD,
    confidence,
    reason:
      confidence >= PERSON_CONFIDENCE_THRESHOLD
        ? "Person detector found a visible person in the image."
        : "Person detector did not find a visible person with enough confidence.",
    source: "model",
  };
}

async function requestPersonDetection(apiKey: string, buffer: Buffer) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PERSON_DETECTION_TIMEOUT_MS,
  );

  try {
    const response = await fetch(PERSON_DETECTION_MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(buffer),
      signal: controller.signal,
    });

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function getPersonDetectionResponse(apiKey: string, buffer: Buffer) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await requestPersonDetection(apiKey, buffer);
      if (!text) continue;
      if (text.toLowerCase().includes("loading")) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      return text;
    } catch {
      if (attempt === 1) throw new Error("Person detector failed after retry.");
    }
  }

  throw new Error("Person detector returned an empty response.");
}

export async function detectPersonInImage(input: {
  buffer?: Buffer;
}): Promise<PersonDetectionResult> {
  const apiKey = process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN;

  if (!input.buffer || !apiKey) {
    return {
      containsPerson: false,
      confidence: 0,
      reason: input.buffer
        ? "Person detector API key is not configured; no person was detected automatically."
        : "Image bytes were unavailable for person detection; no person was detected automatically.",
      source: "unavailable",
    };
  }

  try {
    const text = await getPersonDetectionResponse(apiKey, input.buffer);
    const trimmed = text.trim();

    if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
      return {
        containsPerson: false,
        confidence: 0,
        reason: "Person detector returned a non-JSON response.",
        source: "unavailable",
      };
    }

    return parseDetectionPayload(JSON.parse(trimmed));
  } catch (error) {
    console.error("Person detection failed:", error);
    return {
      containsPerson: false,
      confidence: 0,
      reason: "Person detector is unavailable; no person was detected automatically.",
      source: "unavailable",
    };
  }
}
