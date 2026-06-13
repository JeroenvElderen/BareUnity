export const GALLERY_TYPES = ["nude", "general", "pending"] as const;
export const MODERATION_STATUSES = ["approved", "pending", "rejected"] as const;

export type GalleryType = (typeof GALLERY_TYPES)[number];
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export type GalleryClassification = {
  containsPerson: boolean;
  containsAdultNudity: boolean;
  containsLandscape: boolean;
  containsAnimal: boolean;
  containsVehicle: boolean;
  containsBuilding: boolean;
  confidence: number;
  reason: string;
};

export type GalleryModerationDecision = GalleryClassification & {
  galleryType: GalleryType;
  moderationStatus: ModerationStatus;
};

const CONFIDENCE_THRESHOLD = 0.8;

const NUDE_HINTS = [
  "nude",
  "naked",
  "boudoir",
  "figure-study",
  "figure_study",
  "art-nude",
  "art_nude",
];
const PERSON_HINTS = [
  "person",
  "people",
  "portrait",
  "selfie",
  "human",
  "model",
  "family",
  "friends",
];
const LANDSCAPE_HINTS = [
  "nature",
  "landscape",
  "camp",
  "camping",
  "drone",
  "travel",
  "beach",
  "forest",
  "mountain",
  "lake",
  "river",
  "sunset",
];
const ANIMAL_HINTS = [
  "animal",
  "wildlife",
  "bird",
  "deer",
  "dog",
  "cat",
  "horse",
];
const VEHICLE_HINTS = [
  "vehicle",
  "car",
  "van",
  "truck",
  "bike",
  "boat",
  "rv",
  "camper",
];
const BUILDING_HINTS = [
  "building",
  "architecture",
  "house",
  "cabin",
  "hotel",
  "resort",
  "tower",
];
const CORRUPT_HINTS = ["corrupt", "broken", "malware"];
const ILLEGAL_HINTS = ["illegal", "csam", "minor", "child"];

function hasAnyHint(value: string, hints: readonly string[]) {
  return hints.some((hint) => value.includes(hint));
}

export function isPublicGalleryType(
  value: unknown,
): value is Exclude<GalleryType, "pending"> {
  return value === "nude" || value === "general";
}

export function parseGalleryType(value: unknown): GalleryType {
  return GALLERY_TYPES.includes(value as GalleryType)
    ? (value as GalleryType)
    : "pending";
}

export function parseModerationStatus(value: unknown): ModerationStatus {
  return MODERATION_STATUSES.includes(value as ModerationStatus)
    ? (value as ModerationStatus)
    : "pending";
}

export function classifyGalleryImage(input: {
  fileName?: string;
  contentType?: string;
}): GalleryModerationDecision {
  const signal =
    `${input.fileName ?? ""} ${input.contentType ?? ""}`.toLowerCase();
  const containsAdultNudity = hasAnyHint(signal, NUDE_HINTS);
  const containsPerson =
    containsAdultNudity || hasAnyHint(signal, PERSON_HINTS);
  const containsLandscape = hasAnyHint(signal, LANDSCAPE_HINTS);
  const containsAnimal = hasAnyHint(signal, ANIMAL_HINTS);
  const containsVehicle = hasAnyHint(signal, VEHICLE_HINTS);
  const containsBuilding = hasAnyHint(signal, BUILDING_HINTS);
  const isRejected =
    hasAnyHint(signal, CORRUPT_HINTS) || hasAnyHint(signal, ILLEGAL_HINTS);
  const isKnownCategory =
    containsPerson ||
    containsLandscape ||
    containsAnimal ||
    containsVehicle ||
    containsBuilding;
  const confidence = isRejected ? 0.99 : isKnownCategory ? 0.88 : 0.82;

  if (isRejected) {
    return {
      containsPerson,
      containsAdultNudity,
      containsLandscape,
      containsAnimal,
      containsVehicle,
      containsBuilding,
      confidence,
      galleryType: "pending",
      moderationStatus: "rejected",
      reason: "Upload matched a rejected-content policy signal.",
    };
  }

  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      containsPerson,
      containsAdultNudity,
      containsLandscape,
      containsAnimal,
      containsVehicle,
      containsBuilding,
      confidence,
      galleryType: "pending",
      moderationStatus: "pending",
      reason:
        "AI classification confidence is below the public-gallery threshold.",
    };
  }

  if (containsPerson && containsAdultNudity) {
    return {
      containsPerson,
      containsAdultNudity,
      containsLandscape,
      containsAnimal,
      containsVehicle,
      containsBuilding,
      confidence,
      galleryType: "nude",
      moderationStatus: "approved",
      reason: "Classified as adult human nudity with sufficient confidence.",
    };
  }

  if (!containsAdultNudity) {
    return {
      containsPerson,
      containsAdultNudity,
      containsLandscape,
      containsAnimal,
      containsVehicle,
      containsBuilding,
      confidence,
      galleryType: "general",
      moderationStatus: "approved",
      reason:
        "Classified as allowed non-nude gallery media with sufficient confidence.",
    };
  }

  return {
    containsPerson,
    containsAdultNudity,
    containsLandscape,
    containsAnimal,
    containsVehicle,
    containsBuilding,
    confidence,
    galleryType: "pending",
    moderationStatus: "pending",
    reason: "Classification conflict requires manual review.",
  };
}

export function reportThreshold() {
  const parsed = Number.parseInt(process.env.REPORT_THRESHOLD ?? "3", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}
