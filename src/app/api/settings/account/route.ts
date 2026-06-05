import { NextResponse } from "next/server";

import { deleteAccountCompletely } from "@/lib/account-deletion";
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

    const result = await deleteAccountCompletely(viewerId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
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
