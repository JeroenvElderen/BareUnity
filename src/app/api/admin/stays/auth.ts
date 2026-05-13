import { type NextRequest } from "next/server";

import { ensureAdminRequest } from "@/lib/request-auth";

export async function ensureStayAdmin(request: NextRequest) {
  return ensureAdminRequest(request);
}
