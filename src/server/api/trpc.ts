import { initTRPC, TRPCError } from "@trpc/server";
import { createClient } from "@supabase/supabase-js";
import superjson from "superjson";

import { db } from "@/server/db";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getBearerToken(request: Request | undefined) {
  const authHeader = request?.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

async function getSupabaseUser(request: Request | undefined) {
  const token = getBearerToken(request);

  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await authClient.auth.getUser(token);

  if (error) return null;

  return data.user;
}

export async function createTRPCContext(args?: { req?: Request }) {
  const user = await getSupabaseUser(args?.req);

  return {
    db,
    prisma: db,
    session: user ? { user } : null,
    user,
  };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

/**
 * Router creator
 */
export const createTRPCRouter = t.router;

/**
 * Public procedures (no auth required)
 */
export const publicProcedure = t.procedure;

/**
 * Middleware for protected routes
 */
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Protected procedures (require login)
 */
export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);
