import type { FeedView } from "@/components/Feed";

export const FEED_VIEW_STORAGE_KEY = "bareunity-feed-view";

export function isFeedView(value: string | null): value is FeedView {
  return value === "balanced" || value === "magazine";
}

export function readStoredFeedView(defaultView: FeedView = "balanced"): FeedView {
  if (typeof window === "undefined") {
    return defaultView;
  }

  const storedView = window.localStorage.getItem(FEED_VIEW_STORAGE_KEY);
  return isFeedView(storedView) ? storedView : defaultView;
}