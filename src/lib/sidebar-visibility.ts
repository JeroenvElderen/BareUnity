import type { Home } from "lucide-react";

export const SIDEBAR_VISIBILITY_STORAGE_EVENT = "bareunity:sidebar-visibility";
export const SIDEBAR_VISIBILITY_STORAGE_KEY = "bareunity_sidebar_hidden_items";

export type SidebarItemId =
  | "home"
  | "explore"
  | "gallery"
  | "countries"
  | "bookings"
  | "booking-stays"
  | "booking-activities"
  | "discussion-rooms"
  | "general-room"
  | "video-room"
  | "notifications"
  | "members"
  | "settings"
  | "policies"
  | "verification"
  | "admin"
  | "admin-overview"
  | "admin-applications"
  | "admin-reports"
  | "admin-users"
  | "admin-stays";

export type SidebarVisibilityOption = {
  id: SidebarItemId;
  label: string;
  description: string;
  group: string;
};

export type SidebarHiddenItemSet = Partial<Record<SidebarItemId, boolean>>;

export type SidebarNavItem = {
  id: SidebarItemId;
  icon: typeof Home;
  label: string;
  href?: string;
  badge?: string;
};

export type SidebarNavLinkItem = SidebarNavItem & {
  href: string;
};

export const sidebarVisibilityOptions: readonly SidebarVisibilityOption[] = [
  {
    id: "home",
    label: "Home",
    description: "Hide the main home feed shortcut.",
    group: "Discover",
  },
  {
    id: "explore",
    label: "Explore",
    description: "Hide the map and explore shortcut.",
    group: "Discover",
  },
  {
    id: "gallery",
    label: "Gallery",
    description: "Hide the gallery shortcut.",
    group: "Discover",
  },
  {
    id: "countries",
    label: "Countries",
    description: "Hide the countries dropdown and country pages from the sidebar.",
    group: "Discover",
  },
  {
    id: "bookings",
    label: "Bookings",
    description: "Hide the bookings dropdown and all booking shortcuts.",
    group: "Discover",
  },
  {
    id: "booking-stays",
    label: "Booking stays",
    description: "Hide only the stays shortcut inside Bookings.",
    group: "Discover",
  },
  {
    id: "booking-activities",
    label: "Booking activities",
    description: "Hide only the activities shortcut inside Bookings.",
    group: "Discover",
  },
  {
    id: "discussion-rooms",
    label: "Discussion Rooms",
    description: "Hide the discussion rooms dropdown and room shortcuts.",
    group: "Naturist Circle",
  },
  {
    id: "general-room",
    label: "General Room",
    description: "Hide only the General Room shortcut.",
    group: "Naturist Circle",
  },
  {
    id: "video-room",
    label: "Video Room",
    description: "Hide only the Video Room shortcut.",
    group: "Naturist Circle",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Hide the notifications shortcut and badge.",
    group: "Naturist Circle",
  },
  {
    id: "members",
    label: "Members",
    description: "Hide the members directory shortcut.",
    group: "Naturist Circle",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Hide the account settings shortcut.",
    group: "Naturist Circle",
  },
  {
    id: "policies",
    label: "Policies",
    description: "Hide the policies shortcut.",
    group: "Naturist Circle",
  },
  {
    id: "verification",
    label: "Get verified",
    description: "Hide the verification call-to-action from eligible users.",
    group: "Naturist Circle",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Hide the admin dropdown from platform admins. Admin URLs remain protected and accessible directly.",
    group: "Admin",
  },
  {
    id: "admin-overview",
    label: "Admin overview",
    description: "Hide only the admin overview shortcut.",
    group: "Admin",
  },
  {
    id: "admin-applications",
    label: "Admin applications",
    description: "Hide only the admin applications shortcut.",
    group: "Admin",
  },
  {
    id: "admin-reports",
    label: "Admin reports",
    description: "Hide only the admin reports shortcut.",
    group: "Admin",
  },
  {
    id: "admin-users",
    label: "Admin users",
    description: "Hide only the admin users shortcut.",
    group: "Admin",
  },
  {
    id: "admin-stays",
    label: "Admin stays",
    description: "Hide only the admin stays shortcut.",
    group: "Admin",
  },
];

const validSidebarItemIds = new Set<SidebarItemId>(
  sidebarVisibilityOptions.map((option) => option.id),
);

export function isSidebarItemId(value: unknown): value is SidebarItemId {
  return typeof value === "string" && validSidebarItemIds.has(value as SidebarItemId);
}

export function normalizeSidebarHiddenItems(value: unknown): SidebarHiddenItemSet {
  const hiddenItems: SidebarHiddenItemSet = {};

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (isSidebarItemId(item)) hiddenItems[item] = true;
    });
    return hiddenItems;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, isHidden]) => {
      if (isSidebarItemId(key) && isHidden === true) hiddenItems[key] = true;
    });
  }

  return hiddenItems;
}

export function sidebarHiddenItemsToArray(hiddenItems: SidebarHiddenItemSet) {
  return sidebarVisibilityOptions
    .map((option) => option.id)
    .filter((id) => hiddenItems[id] === true);
}

export function isSidebarItemHidden(
  hiddenItems: SidebarHiddenItemSet,
  id: SidebarItemId,
) {
  return hiddenItems[id] === true;
}
