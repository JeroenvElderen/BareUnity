export type Profile = {
  username: string
  avatar_url: string | null
}

export type Post = {
  id: string
  title: string | null
  content: string | null
  media_url: string | null
  created_at: string
  profiles: Profile[]
}