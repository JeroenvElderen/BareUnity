import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";

export const postRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, body: true, createdAt: true },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(3).max(120),
        body: z.string().min(3).max(3000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.post.create({
        data: {
          title: input.title,
          body: input.body,
          authorId: ctx.session.user.id,
        },
      });
    }),
});