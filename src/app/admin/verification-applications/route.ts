import { NextRequest, NextResponse } from "next/server";
import { ensureAdminRequest } from "@/lib/request-auth";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

type VerificationRow = {
  user_id: string;
  legal_name: string;
  display_name: string;
  date_of_birth: string;
  country: string;
  membership_type: string;
  id_type: string;
  status: string;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
};

function extractIdDocumentPath(reviewerNotes: string | null) {
  if (!reviewerNotes) return null;

  if (reviewerNotes.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(reviewerNotes) as Record<string, unknown>;
      const jsonPath = parsed.idDocumentPath;

      if (typeof jsonPath === "string" && jsonPath.trim()) {
        return jsonPath.trim();
      }
    } catch {
      // Fall back to legacy key-value reviewer notes below.
    }
  }

  const marker = "id_document_path=";
  const start = reviewerNotes.indexOf(marker);

  if (start < 0) {
    return null;
  }

  const value = reviewerNotes.slice(start + marker.length);
  const terminator = value.indexOf(";");
  return (terminator >= 0 ? value.slice(0, terminator) : value).trim() || null;
}

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin credentials are not configured." },
      { status: 500 },
    );
  }

  const adminResult = await ensureAdminRequest(request);

  if ("error" in adminResult) {
    return adminResult.error;
  }

  const supabaseAdmin = createSupabaseAdminClient();

  const { data, error } = await supabaseAdmin
    .from("verification_submissions")
    .select(
      "user_id, legal_name, display_name, date_of_birth, country, membership_type, id_type, status, reviewer_notes, created_at, updated_at",
    )
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as VerificationRow[];
  const withSignedUrls = await Promise.all(
    rows.map(async (row) => {
      const idDocumentPath = extractIdDocumentPath(row.reviewer_notes);
      let idDocumentUrl: string | null = null;

      if (idDocumentPath) {
        const { data: signedData, error: signedError } =
          await supabaseAdmin.storage
            .from("verification-documents")
            .createSignedUrl(idDocumentPath, 60 * 15);

        if (!signedError) {
          idDocumentUrl = signedData.signedUrl;
        }
      }

      return {
        ...row,
        idDocumentPath,
        idDocumentUrl,
      };
    }),
  );

  return NextResponse.json({ applications: withSignedUrls });
}
