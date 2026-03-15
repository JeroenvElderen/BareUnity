import { NextResponse } from "next/server";

export function middleware() {
  // Supabase auth in this app is currently client-side (localStorage session),
  // so middleware cannot reliably read auth state from cookies.
  // Enforcing redirects here causes successful login attempts to bounce back
  // to /login and look like a page refresh loop.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};