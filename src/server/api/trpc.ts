import { initTRPC, TRPCError } from "@trpc/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import superjson from "superjson";

const prisma = new PrismaClient();

export async function createTRPCContext() {
  const session = await auth();

  return {
    prisma,
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