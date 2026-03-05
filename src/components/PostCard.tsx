import Image from "next/image"
import { Post } from "@/types/database"

export default function PostCard({ post }: { post: Post }) {

  const profile = post.profiles[0]

  return (
    <div className="border rounded-xl p-4 bg-white shadow-sm">

      <div className="flex items-center gap-3 mb-3">

        {profile?.avatar_url && (
          <Image
            src={profile.avatar_url}
            alt="User avatar"
            width={40}
            height={40}
            className="rounded-full"
          />
        )}

        <div>
          <p className="font-semibold">
            {profile?.username ?? "Unknown"}
          </p>

          <p className="text-sm text-gray-500">
            {new Date(post.created_at).toLocaleString()}
          </p>
        </div>

      </div>

      {post.title && (
        <h2 className="text-lg font-bold mb-2">
          {post.title}
        </h2>
      )}

      {post.content && (
        <p className="mb-3">{post.content}</p>
      )}

      {post.media_url && (
        <Image
          src={post.media_url}
          alt="Post image"
          width={800}
          height={500}
          className="rounded-lg max-h-[500px] object-cover"
        />
      )}

    </div>
  )
}