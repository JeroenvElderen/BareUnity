export const CHANNEL_ADMIN_EMAIL = "jeroen.vanelderen@hotmail.com";

export type ChannelContentType = "general" | "retreats" | "mindful" | "map" | "discussion" | "custom";

export type Channel = {
  id: string;
  name: string;
  iconUrl: string | null;
  contentType: ChannelContentType;
};

export const CHANNELS: Channel[] = [
  { id: "general-nature", name: "General Nature", iconUrl: null, contentType: "general" },
  { id: "retreats", name: "Retreats", iconUrl: null, contentType: "retreats" },
  { id: "mindful-living", name: "Mindful Living", iconUrl: null, contentType: "mindful" },
  { id: "naturist-map", name: "Naturist Map", iconUrl: null, contentType: "map" },
  { id: "discussion", name: "Discussion", iconUrl: null, contentType: "discussion" },
];

export function getChannels() {
  return CHANNELS;
}

export function getChannelById(channelId: string) {
  return CHANNELS.find((channel) => channel.id === channelId) ?? null;
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
