import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@/auth";
mport { db } from "@/server/db";
import superjson from "superjson";
import { db } from "../db";

export async function createTRPCContext() {
  const session = await auth();

  return {
    prisma: db,
    session,
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
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.session.user,
    },
  });
});

/**
 * Protected procedures (require login)
 */
export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);