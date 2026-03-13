import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const channels = await prisma.channels.findMany({
  include: {
    posts: true,
    channel_messages: true
  }
})

console.log(channels)