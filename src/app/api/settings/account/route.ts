import { NextResponse } from "next/server";

import { deleteAccountCompletely } from "@/lib/account-deletion";
import { sendAccountDeletedEmail } from "@/lib/email";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { loadViewerIdFromRequest } from "@/lib/viewer";

export async function DELETE(request: Request) {
  try {
    const viewerId = await loadViewerIdFromRequest(request);

    if (!viewerId) {
      return NextResponse.json(
        { error: "Please sign in again before deleting your account." },
        { status: 401 },
      );
    }

    let email: string | null = null;
    let displayName: string | null = null;

    if (isSupabaseAdminConfigured) {
      const supabaseAdmin = createSupabaseAdminClient();
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(viewerId);

      if (!error) {
        email = data.user?.email?.trim().toLowerCase() ?? null;
        const metadata = data.user?.user_metadata as
          | Record<string, unknown>
          | undefined;
        const metadataDisplayName = metadata?.display_name ?? metadata?.full_name;
        displayName =
          typeof metadataDisplayName === "string" ? metadataDisplayName : null;
      }
    }

    const result = await deleteAccountCompletely(viewerId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (email) {
      await sendAccountDeletedEmail({ email, displayName }).catch((error) => {
        console.error("Failed to send account deletion email", error);
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to delete account", error);
    return NextResponse.json(
      { error: "Account deletion is unavailable right now." },
      { status: 503 },
    );
  }
}
