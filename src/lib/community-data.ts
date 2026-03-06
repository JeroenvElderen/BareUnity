export type CommunityPrivacy = "public" | "restricted" | "private";
export type CommunityRole = "owner" | "member";

export type CommunityTheme = {
  primary: string;
  secondary: string;
};

export type Community = {
  id: string;
  name: string;
  description: string;
  privacy: CommunityPrivacy;
  mature: boolean;
  role: CommunityRole;
  theme: CommunityTheme;
  textChannels: string[];
  voiceChannels: string[];
};

export const COMMUNITY_STORAGE_KEY = "bareunity-communities";

const defaultTheme: CommunityTheme = {
  primary: "#ff5a0a",
  secondary: "#340b05",
};

export const seedCommunities: Community[] = [
  {
    id: "67b5b4f5-847f-4f55-a7ef-8f50648f35ee",
    name: "BareUnity",
    description: "Main naturist community hub for events, discussion, and support.",
    privacy: "public",
    mature: true,
    role: "owner",
    theme: { primary: "#ff5a0a", secondary: "#340b05" },
    textChannels: ["general", "announcements", "introductions"],
    voiceChannels: ["Lobby", "Town Hall"],
  },
  {
    id: "0a2db4c6-03db-43df-a273-bf7c5326f4e4",
    name: "SunTrail Camp",
    description: "Community for outdoor weekend meetups and camp planning.",
    privacy: "restricted",
    mature: false,
    role: "member",
    theme: { primary: "#4d8f55", secondary: "#0f2613" },
    textChannels: ["general", "trip-plans"],
    voiceChannels: ["General"],
  },
  {
    id: "7a598228-86af-4f9e-90e0-49e2891ecf3b",
    name: "Body Positivity Circle",
    description: "Supportive conversations around confidence and self-acceptance.",
    privacy: "private",
    mature: false,
    role: "member",
    theme: { primary: "#a046bd", secondary: "#2a0f31" },
    textChannels: ["welcome", "resources"],
    voiceChannels: ["Support Room"],
  },
];

function normalizeCommunity(community: Community | (Community & { theme?: CommunityTheme })): Community {
  const nextId = isUuid(community.id)
    ? community.id
    : typeof crypto !== "undefined"
      ? crypto.randomUUID()
      : community.id;

  return {
    ...community,
    id: nextId,
    theme: community.theme ?? defaultTheme,
  };
}


function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function readStoredCommunities() {
  if (typeof window === "undefined") {
    return seedCommunities;
  }

  const stored = window.localStorage.getItem(COMMUNITY_STORAGE_KEY);
  if (!stored) {
    return seedCommunities;
  }

  try {
    const parsed = JSON.parse(stored) as Array<Community & { theme?: CommunityTheme }>;
    return parsed.map((community) => normalizeCommunity(community));
  } catch {
    return seedCommunities;
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
