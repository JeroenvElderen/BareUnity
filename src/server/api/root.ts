import { createTRPCRouter } from "./trpc"
import { channelRouter } from "./routers/channel"
import { postRouter } from "./routers/post"

export const appRouter = createTRPCRouter({
  channels: channelRouter,
  posts: postRouter,
})

export type AppRouter = typeof appRouter