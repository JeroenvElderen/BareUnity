import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

const ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

  const marker = "id_document_path=";
  const start = reviewerNotes.indexOf(marker);

  if (start < 0) {
    return null;
  }

  const value = reviewerNotes.slice(start + marker.length);
  const terminator = value.indexOf(";");
  return (terminator >= 0 ? value.slice(0, terminator) : value).trim() || null;
}

async function ensureAdmin(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      error: NextResponse.json({ error: "Supabase public auth config missing." }, { status: 500 }),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return {
      error: NextResponse.json({ error: "Missing bearer token." }, { status: 401 }),
    };
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    return {
      error: NextResponse.json({ error: "Invalid auth token." }, { status: 401 }),
    };
  }

  if ((data.user.email ?? "").toLowerCase() !== ADMIN_EMAIL) {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase admin credentials are not configured." }, { status: 500 });
  }

  const adminResult = await ensureAdmin(request);

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
        const { data: signedData, error: signedError } = await supabaseAdmin.storage
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