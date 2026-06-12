import {
  findProfileSettingsControls,
  findProfileSettingsSnapshot,
} from "@/lib/profile-settings-compat";
import {
  normalizeSettingOptionStates,
  type OptionState,
} from "@/lib/settings-controls";
import { db } from "@/server/db";

type VisibilityContext = {
  isOwner: boolean;
  isMember: boolean;
};

function normalizeStoredOptionStates(value: unknown) {
  return normalizeSettingOptionStates(value);
}

function canViewState(
  state: OptionState | undefined,
  context: VisibilityContext,
) {
  const level = state ?? "Everyone";
  if (context.isOwner) return true;
  if (level === "Everyone") return true;
  if (level === "Members only") return context.isMember;
  return false;
}

async function getViewerContext(
  targetUserId: string,
  viewerId?: string | null,
): Promise<VisibilityContext> {
  const isOwner = Boolean(viewerId && viewerId === targetUserId);
  return { isOwner, isMember: Boolean(viewerId) };
}

export type ProfileSnapshotProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
};

export type ProfileSnapshotPost = {
  id: string;
  title: string | null;
  content: string | null;
  media_url: string | null;
  created_at: string | null;
  post_type: string | null;
};

export type ProfileSnapshotPayload = {
  profile: ProfileSnapshotProfile | null;
  posts: ProfileSnapshotPost[];
  interests: string[];
  stats: { posts: number; comments: number };
};

export const EMPTY_PROFILE_SNAPSHOT: ProfileSnapshotPayload = {
  profile: null,
  posts: [],
  interests: [],
  stats: { posts: 0, comments: 0 },
};

export async function buildProfileSnapshotPayload(
  userId: string,
  viewerId?: string | null,
): Promise<ProfileSnapshotPayload> {
  const profile = await db.profiles.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      display_name: true,
      bio: true,
      avatar_url: true,
      location: true,
    },
  });

  if (!profile) return EMPTY_PROFILE_SNAPSHOT;

  // Keep Prisma reads sequential. Hosted runtimes use the Supabase pooler with
  // connection_limit=1, and parallel queries can surface as intermittent 503s.
  const viewerContext = await getViewerContext(profile.id, viewerId);
  const postsWhere = {
    author_id: profile.id,
    OR: [{ post_type: null }, { post_type: { not: "story" } }],
  };
  const posts = await db.posts.findMany({
    where: postsWhere,
    select: {
      id: true,
      title: true,
      content: true,
      media_url: true,
      created_at: true,
      post_type: true,
    },
    orderBy: { created_at: "desc" },
    take: 30,
  });
  const settings = await findProfileSettingsControls(profile.id);
  const postsCount = await db.posts.count({
    where: postsWhere,
  });
  const commentsCount = await db.comments.count({
    where: { author_id: profile.id },
  });

  const settingStates = normalizeStoredOptionStates(
    settings?.setting_control_states,
  );
  const profileVisibility = settingStates["privacy.Profile visibility"];

  if (!canViewState(profileVisibility, viewerContext)) {
    return EMPTY_PROFILE_SNAPSHOT;
  }

  const canViewDisplayName = canViewState(
    settingStates["privacy.Display name visibility"],
    viewerContext,
  );
  const canViewLocation = canViewState(
    settingStates["privacy.Location precision"],
    viewerContext,
  );

  return {
    profile: {
      ...profile,
      display_name: canViewDisplayName ? profile.display_name : null,
      location: canViewLocation ? profile.location : null,
    },
    posts: posts.map((post) => ({
      ...post,
      created_at: post.created_at?.toISOString() ?? null,
    })),
    interests: (settings?.interests ?? []).slice(0, 8),
    stats: {
      posts: postsCount,
      comments: commentsCount,
    },
  };
}

export async function getProfileSnapshotSourceVersion(
  userId: string,
): Promise<string> {
  const profile = await db.profiles.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      display_name: true,
      bio: true,
      avatar_url: true,
      location: true,
    },
  });
  const latestPost = await db.posts.findFirst({
    where: {
      author_id: userId,
      OR: [{ post_type: null }, { post_type: { not: "story" } }],
    },
    orderBy: { created_at: "desc" },
    select: { id: true, created_at: true },
  });
  const latestComment = await db.comments.findFirst({
    where: { author_id: userId },
    orderBy: { created_at: "desc" },
    select: { id: true, created_at: true },
  });
  const settings = await findProfileSettingsSnapshot(userId);

  return JSON.stringify({
    profile,
    latestPostId: latestPost?.id ?? null,
    latestPostCreatedAt: latestPost?.created_at?.toISOString() ?? null,
    latestCommentId: latestComment?.id ?? null,
    latestCommentCreatedAt: latestComment?.created_at?.toISOString() ?? null,
    settingsUpdatedAt: settings?.updated_at?.toISOString() ?? null,
    interests: settings?.interests ?? [],
    optionStates: normalizeSettingOptionStates(settings?.setting_control_states),
  });
}
