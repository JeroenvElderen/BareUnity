import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const channelRouter = createTRPCRouter({
  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.channels.findMany({
      orderBy: { position: "asc" },
    });
  }),
});