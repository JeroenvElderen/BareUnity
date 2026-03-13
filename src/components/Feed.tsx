"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PostCard from "./PostCard";
import { Post } from "@/types/database";
import { readCachedValue, writeCachedValue } from "@/lib/client-cache";

export type FeedView = "balanced" | "magazine";

const FEED_CACHE_KEY = "bareunity:feed:posts";
const FEED_CACHE_TTL_MS = 1000 * 60 * 5;

type SupabasePost = {
  id: string;
  title: string | null;
  content: string | null;
  media_url: string | null;
  created_at: string;
  profiles: {
    username: string;
    avatar_url: string | null;
  }[];
};

export default function Feed({ view }: { view: FeedView }) {
  const [posts, setPosts] = useState<Post[]>(() => readCachedValue<Post[]>(FEED_CACHE_KEY, FEED_CACHE_TTL_MS) ?? []);
  const [loading, setLoading] = useState(() => posts.length === 0);

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
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      const formattedPosts: Post[] = (data as SupabasePost[]).map((post) => ({
        ...post,
        profiles: post.profiles ?? [],
      }));

      setPosts(formattedPosts);
      writeCachedValue(FEED_CACHE_KEY, formattedPosts);
      setLoading(false);
    }

    void loadPosts();
  }, []);

  if (loading) {
    return (
      <section className="glass-card p-8 text-center">
        <p className="text-base text-text">Loading posts…</p>
      </section>
    );
  }
  
  if (posts.length === 0) {
    return (
      <section className="glass-card p-8 text-center">
        <p className="text-base text-text">No posts yet.</p>
        <p className="mt-2 text-sm text-muted">Be the first to share your naturist story.</p>
      </section>
    );
  }

  if (view === "balanced") {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} view={view} />
        ))}
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {posts.map((post, index) => (
        <PostCard key={post.id} post={post} view={view} emphasize={index % 4 === 0} />
      ))}
    </div>
  );
}