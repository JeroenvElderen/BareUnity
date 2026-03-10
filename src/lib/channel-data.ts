export type ChannelWorkspacePrivacy = "public" | "restricted" | "private";
export type ChannelWorkspaceRole = "owner" | "admin" | "manager" | "member";

export type ChannelWorkspaceTheme = {
  primary: string;
  secondary: string;
};

export type ChannelJoinMode = "open" | "request" | "invite_only";

export type ChannelFlair = {
  id: string;
  label: string;
  color: string;
};

export type ChannelAutoModerationRule = {
  id: string;
  name: string;
  keyword: string;
  action: "flag" | "remove";
  enabled: boolean;
};

export type ChannelWorkspace = {
  id: string;
  name: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  privacy: ChannelWorkspacePrivacy;
  mature: boolean;
  role: ChannelWorkspaceRole;
  theme: ChannelWorkspaceTheme;
  textChannels: string[];
  voiceChannels: string[];
  tags: string[];
  category: string | null;
  rules: string[];
  flairs: ChannelFlair[];
  autoModerationRules: ChannelAutoModerationRule[];
  announcement: string | null;
  welcomeMessage: string | null;
  isFeatured: boolean;
  isVerified: boolean;
  joinMode: ChannelJoinMode;
};

export const CHANNEL_WORKSPACE_STORAGE_KEY = "bareunity-channels";

const defaultTheme: ChannelWorkspaceTheme = {
  primary: "#ff5a0a",
  secondary: "#340b05",
};

export const seedChannelWorkspaces: ChannelWorkspace[] = [
  {
    id: "67b5b4f5-847f-4f55-a7ef-8f50648f35ee",
    name: "BareUnity",
    description: "Official BareUnity channel workspace for announcements, support, events, and discussion.",
    logoUrl: "https://api.dicebear.com/9.x/shapes/png?seed=BareUnity",
    bannerUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=80",
    privacy: "public",
    mature: true,
    role: "owner",
    theme: { primary: "#ff5a0a", secondary: "#340b05" },
    textChannels: ["general", "announcements", "introductions", "support"],
    voiceChannels: ["Lobby", "Town Hall"],
    tags: ["official", "events", "support"],
    category: "Brand",
    rules: ["Respect others", "No spam", "Keep content relevant to BareUnity"],
    flairs: [
      { id: "discussion", label: "Discussion", color: "#f97316" },
      { id: "events", label: "Events", color: "#22c55e" },
      { id: "support", label: "Support", color: "#3b82f6" },
    ],
    autoModerationRules: [
      { id: "rule-links", name: "Flag suspicious links", keyword: "bit.ly", action: "flag", enabled: true },
      { id: "rule-spam", name: "Remove spam phrases", keyword: "free followers", action: "remove", enabled: true },
    ],
    announcement: "Welcome to the official BareUnity workspace.",
    welcomeMessage: "Start in #introductions and read the channel workspace rules.",
    isFeatured: true,
    isVerified: true,
    joinMode: "open",
  },
];

type ChannelWorkspaceDraft = ChannelWorkspace & {
  theme?: ChannelWorkspaceTheme;
  tags?: string[];
  category?: string | null;
  rules?: string[];
  flairs?: ChannelFlair[];
  autoModerationRules?: ChannelAutoModerationRule[];
  announcement?: string | null;
  welcomeMessage?: string | null;
  isFeatured?: boolean;
  isVerified?: boolean;
  joinMode?: ChannelJoinMode;
};

function normalizeChannelWorkspace(channelWorkspace: ChannelWorkspaceDraft): ChannelWorkspace {
  const nextId = isUuid(channelWorkspace.id)
    ? channelWorkspace.id
    : typeof crypto !== "undefined"
      ? crypto.randomUUID()
      : channelWorkspace.id;

  return {
    ...channelWorkspace,
    id: nextId,
    role: ((channelWorkspace as { role: string }).role === "moderator" ? "manager" : channelWorkspace.role) as ChannelWorkspaceRole,
    logoUrl: channelWorkspace.logoUrl ?? null,
    bannerUrl: channelWorkspace.bannerUrl ?? null,
    theme: channelWorkspace.theme ?? defaultTheme,
    tags: channelWorkspace.tags ?? [],
    category: channelWorkspace.category ?? null,
    rules: channelWorkspace.rules ?? ["Be respectful"],
    flairs: channelWorkspace.flairs ?? [],
    autoModerationRules: channelWorkspace.autoModerationRules ?? [],
    announcement: channelWorkspace.announcement ?? null,
    welcomeMessage: channelWorkspace.welcomeMessage ?? null,
    isFeatured: channelWorkspace.isFeatured ?? false,
    isVerified: channelWorkspace.isVerified ?? false,
    joinMode: channelWorkspace.joinMode ?? "open",
  };
}

function enforceSingleChannelWorkspace(channelWorkspaces: ChannelWorkspace[]) {
  if (channelWorkspaces.length === 0) {
    return seedChannelWorkspaces;
  }

  const official = channelWorkspaces.find((channelWorkspace) => channelWorkspace.name.toLowerCase() === "bareunity") ?? channelWorkspaces[0];
  return [official];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function readStoredChannelWorkspaces() {
  if (typeof window === "undefined") {
    return seedChannelWorkspaces;
  }

  const stored = window.localStorage.getItem(CHANNEL_WORKSPACE_STORAGE_KEY);
  if (!stored) {
    return seedChannelWorkspaces;
  }

  try {
    const parsed = JSON.parse(stored) as ChannelWorkspaceDraft[];
    const normalized = parsed.map((channelWorkspace) => normalizeChannelWorkspace(channelWorkspace));
    return enforceSingleChannelWorkspace(normalized);
  } catch {
    return seedChannelWorkspaces;
  }
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
