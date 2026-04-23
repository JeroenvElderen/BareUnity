export const SOCIAL_GRAPH_UPDATED_EVENT = "bareunity:social-graph-updated";

export function emitSocialGraphUpdatedEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new window.CustomEvent(SOCIAL_GRAPH_UPDATED_EVENT));
}

export function subscribeToSocialGraphUpdates(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const wrappedListener = () => listener();
  window.addEventListener(SOCIAL_GRAPH_UPDATED_EVENT, wrappedListener);

  return () => {
    window.removeEventListener(SOCIAL_GRAPH_UPDATED_EVENT, wrappedListener);
  };
}
