import { type NextRequest, NextResponse } from "next/server";

import { ensureStayAdmin } from "@/app/api/admin/stays/auth";
import { importStayWebsite, type StayImportDraft } from "@/app/api/admin/stays/import/importer";
import type { SpaListing } from "@/app/bookings/spas/spas-data";

type Params = { params: Promise<{ category: string }> };

type SpaImportDraft = Omit<StayImportDraft, "type"> & {
  type: SpaListing["type"];
};

function statusForImportError(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error.message === "Missing website URL." || error.message === "Enter a valid http(s) website URL.") return 400;
  if (error.message === "No crawlable website pages or documents were found.") return 502;
  return 500;
}

function inferSpaType(draft: StayImportDraft): SpaListing["type"] {
  const text = [
    draft.name,
    draft.badge,
    draft.vibe,
    draft.description,
    draft.checkInWindow,
    ...draft.amenities,
    ...draft.policies.flatMap((policy) => [policy.category, ...policy.items]),
  ].join(" ");

  if (/thermal|hot spring|mineral bath|terme|therme|onsen/i.test(text)) return "Thermal spa";
  if (/massage|bodywork|massage studio|therapist|treatment/i.test(text)) return "Massage studio";
  if (/wellness|retreat|health club|sauna|hammam|hydrotherapy|spa/i.test(text)) return "Wellness center";
  return "Day spa";
}

function spaWarningFromStayWarning(warning: string) {
  return warning
    .replace(/stay details/g, "spa details")
    .replace(/stay website/g, "spa website")
    .replace(/stay country/g, "spa country")
    .replace(/stay name/g, "spa name")
    .replace(/No stay/g, "No spa");
}

function adaptStayDraftToSpaDraft(draft: StayImportDraft): SpaImportDraft {
  return {
    ...draft,
    type: inferSpaType(draft),
    badge: draft.badge || "Website-sourced spa",
    vibe: draft.vibe || "Naturist-friendly wellness",
    checkInWindow:
      draft.checkInWindow || "Check the spa website for current treatment availability",
    warnings: [
      ...draft.warnings.map(spaWarningFromStayWarning),
      "Spa import uses the shared stays importer; review the spa type before saving.",
    ],
  };
}

export async function GET(request: NextRequest, { params }: Params) {
  const adminResult = await ensureStayAdmin(request);
  if ("error" in adminResult) return adminResult.error;

  const { category } = await params;
  if (category !== "spas") {
    return NextResponse.json(
      { error: "Spa import is only available for the spas category." },
      { status: 404 },
    );
  }

  const url = new URL(request.url).searchParams.get("url")?.trim() ?? "";

  try {
    const stayDraft = await importStayWebsite(url);
    return NextResponse.json({ draft: adaptStayDraftToSpaDraft(stayDraft) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import this website." },
      { status: statusForImportError(error) },
    );
  }
}
