import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";

export const postRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.posts.findMany({
      orderBy: { created_at: "desc" },
      take: 20,
      select: { id: true, title: true, content: true, created_at: true },
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
      return ctx.db.posts.create({
        data: {
          title: input.title,
          content: input.body,
          author_id: ctx.user.id,
        },
      });
    }),
});