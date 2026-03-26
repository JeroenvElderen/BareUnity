import { createTRPCRouter, publicProcedure } from "../trpc"

export const postRouter = createTRPCRouter({
  hello: publicProcedure.query(() => {
    return { message: "ok" }
  }),
})