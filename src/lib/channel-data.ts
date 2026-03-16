export type ChannelContentType = "map" | "discussion";

export type Channel = {
  id: string;
  name: string;
  href: string;
  iconUrl: string | null;
  contentType: ChannelContentType;
};

export const CHANNELS: Channel[] = [
  { id: "naturist-map", name: "Naturist Map", href: "/naturist-map", iconUrl: null, contentType: "map" },
  { id: "discussion", name: "Discussion", href: "/discussion", iconUrl: null, contentType: "discussion" },
];

export function getChannels() {
  return CHANNELS;
}

export function getChannelById(channelId: string) {
  return CHANNELS.find((channel) => channel.id === channelId) ?? null;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
