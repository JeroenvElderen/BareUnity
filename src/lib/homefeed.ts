export type HomeFeedStory = {
  id: string;
  postId: string;
  authorId: string;
  name: string;
  fallback: string;
  tone: string;
  imageUrl: string | null;
  posted: string;
  createdAt: string;
};

export type HomeFeedFriend = {
  id: string;
  name: string;
  fallback: string;
  status: "Online" | "Offline";
};

export type HomeFeedPost = {
  id: string;
  author: string;
  fallback: string;
  posted: string;
  text: string;
  mediaUrl: string | null;
  postType: "text" | "image";
  likes: number;
  comments: HomeFeedComment[];
  likedByViewer: boolean;
  tone: string;
  authorId: string | null;
};

export type HomeFeedComment = {
  id: string;
  content: string;
  authorId: string | null;
  authorName: string;
  authorFallback: string;
  authorAvatarUrl: string | null;
  parentId: string | null;
};

export type HomeFeedPayload = {
  stories: HomeFeedStory[];
  friends: HomeFeedFriend[];
  posts: HomeFeedPost[];
  viewerId: string | null;
};

const storyTones = [
  "from-violet-600/75 to-indigo-900/90",
  "from-amber-500/70 to-orange-900/90",
  "from-cyan-500/70 to-sky-900/90",
  "from-fuchsia-500/75 to-violet-950/90",
];

const postTones = [
  "from-cyan-400/80 via-sky-400/70 to-indigo-600/80",
  "from-violet-500/80 via-purple-500/70 to-fuchsia-600/80",
  "from-emerald-400/80 via-teal-400/70 to-cyan-500/80",
  "from-amber-400/80 via-orange-400/70 to-rose-500/80",
];

export function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "BU";
}

export function relativeTime(value: Date | string | null | undefined) {
  if (!value) return "Recently";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Recently";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function pickStoryTone(index: number) {
  return storyTones[index % storyTones.length] ?? storyTones[0];
}

export function pickPostTone(index: number) {
  return postTones[index % postTones.length] ?? postTones[0];
}