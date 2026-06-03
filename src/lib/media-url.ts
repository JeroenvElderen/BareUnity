import { supabase } from "@/lib/supabase";

const ABSOLUTE_OR_BROWSER_URL_PATTERN = /^(?:https?:|data:|blob:|\/)/i;

const KNOWN_MEDIA_FOLDERS = new Set([
  "avatars",
  "gallery",
  "posts",
  "stories",
]);

type ResolveMediaUrlOptions = {
  defaultFolder?: string;
};

export function resolveMediaUrl(rawUrl: string | null | undefined, options: ResolveMediaUrlOptions = {}) {
  if (!rawUrl) return null;

  const value = rawUrl.trim();
  if (!value) return null;

  if (ABSOLUTE_OR_BROWSER_URL_PATTERN.test(value)) return value;

  const firstSegment = value.split("/", 1)[0] ?? "";
  const storagePath =
    options.defaultFolder && !value.includes("/") && !KNOWN_MEDIA_FOLDERS.has(firstSegment)
      ? `${options.defaultFolder}/${value}`
      : value;

  const { data } = supabase.storage.from("media").getPublicUrl(storagePath);
  return data.publicUrl;
}
