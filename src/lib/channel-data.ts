import { supabase } from "@/lib/supabase";

export const CHANNEL_ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";

export type ChannelContentType = "general" | "retreats" | "mindful" | "custom";

export type Channel = {
  id: string;
  name: string;
  iconUrl: string | null;
  contentType: ChannelContentType;
};

type ChannelRow = {
  id: string;
  name: string;
  icon_url?: string | null;
  content_config?: { component_key?: string | null } | null;
  is_enabled?: boolean | null;
};

const STATIC_CHANNELS: Channel[] = [
  { id: "general-nature", name: "General Nature", iconUrl: null, contentType: "general" },
  { id: "retreats", name: "Retreats", iconUrl: null, contentType: "retreats" },
  { id: "mindful-living", name: "Mindful Living", iconUrl: null, contentType: "mindful" },
];

function normalizeContentType(raw: string | null | undefined): ChannelContentType {
  if (raw === "retreats") return "retreats";
  if (raw === "mindful") return "mindful";
  if (raw === "custom") return "custom";
  return "general";
}

function normalizeChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    iconUrl: row.icon_url ?? null,
    contentType: normalizeContentType(row.content_config?.component_key),
  };
}

export async function readChannelsFromSupabase() {
  const { data, error } = await supabase
    .from("channels")
    .select("id, name, icon_url, content_config, is_enabled")
    .eq("is_enabled", true)
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error(error);
    return STATIC_CHANNELS;
  }

  const channels = (data ?? []).map((row) => normalizeChannel(row as ChannelRow));
  return channels.length ? channels : STATIC_CHANNELS;
}

export function isChannelAdmin(email: string | null | undefined) {
  return (email ?? "").toLowerCase() === CHANNEL_ADMIN_EMAIL;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
