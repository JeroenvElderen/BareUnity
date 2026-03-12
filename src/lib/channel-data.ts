import { supabase } from "@/lib/supabase";

export type Channel = {
  id: string;
  name: string;
  iconUrl: string | null;
};

type ChannelRow = {
  id: string;
  name: string;
  icon_url?: string | null;
  logo_url?: string | null;
};

function normalizeChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    iconUrl: row.icon_url ?? row.logo_url ?? null,
  };
}

export async function readChannelsFromSupabase() {
  const primary = await supabase.from("channels").select("id, name, icon_url").order("name", { ascending: true });

  if (!primary.error) {
    return (primary.data ?? []).map((row) => normalizeChannel(row as ChannelRow));
  }

  if (!primary.error.message.includes("icon_url")) {
    console.error(primary.error);
    return [] as Channel[];
  }

  const fallback = await supabase.from("channels").select("id, name, logo_url").order("name", { ascending: true });
  if (fallback.error) {
    console.error(fallback.error);
    return [] as Channel[];
  }

  return (fallback.data ?? []).map((row) => normalizeChannel(row as ChannelRow));
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
