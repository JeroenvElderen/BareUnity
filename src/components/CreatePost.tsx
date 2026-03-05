"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

export default function CreatePost() {

  const [content, setContent] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {

    setLoading(true)

    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user

    if (!user) {
      alert("You must be logged in")
      return
    }

    let mediaUrl: string | null = null

    if (image) {

      const filePath = `posts/${crypto.randomUUID()}-${image.name}`

      const { error } = await supabase.storage
        .from("media")
        .upload(filePath, image)

      if (error) {
        console.error(error)
        setLoading(false)
        return
      }

      const { data } = supabase.storage
        .from("media")
        .getPublicUrl(filePath)

      mediaUrl = data.publicUrl
    }

    const { error } = await supabase
      .from("posts")
      .insert({
        author_id: user.id,
        content: content,
        media_url: mediaUrl
      })

    if (error) {
      console.error(error)
    }

    setContent("")
    setImage(null)
    setLoading(false)

    window.location.reload()
  }

  return (
    <div className="border rounded-xl p-4 bg-white mb-6">

      <textarea
        placeholder="Share something..."
        className="w-full border rounded-lg p-2 mb-3"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setImage(e.target.files?.[0] || null)}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg"
      >
        {loading ? "Posting..." : "Post"}
      </button>

    </div>
  )
}