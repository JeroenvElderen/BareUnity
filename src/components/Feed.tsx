"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import PostCard from "./PostCard"
import { Post } from "@/types/database"

type SupabasePost = {
  id: string
  title: string | null
  content: string | null
  media_url: string | null
  created_at: string
  profiles: {
    username: string
    avatar_url: string | null
  }[]
}

export default function Feed() {

  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {

    async function loadPosts() {

      const { data, error } = await supabase
        .from("posts")
        .select(`
          id,
          title,
          content,
          media_url,
          created_at,
          profiles (
            username,
            avatar_url
          )
        `)
        .order("created_at", { ascending: false })

      if (error) {
        console.error(error)
        return
      }

      const formattedPosts: Post[] =
        (data as SupabasePost[]).map((post) => ({
          ...post,
          profiles: post.profiles ?? []
        }))

      setPosts(formattedPosts)
    }

    loadPosts()

  }, [])

  return (
    <div className="space-y-6">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}