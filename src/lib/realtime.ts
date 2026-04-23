import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type SubscribeToTablesArgs = {
  channelName: string;
  client: SupabaseClient;
  tables: readonly string[];
  onChange: () => void;
  debounceMs?: number;
};

type TeardownRealtimeSubscription = () => void;

export function subscribeToTables(args: SubscribeToTablesArgs): TeardownRealtimeSubscription {
  let refreshTimer: number | undefined;
  const debounceMs = args.debounceMs ?? 400;

  const scheduleChange = () => {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
    }
    refreshTimer = window.setTimeout(() => {
      args.onChange();
    }, debounceMs);
  };

  const channel: RealtimeChannel = args.client.channel(args.channelName);
  args.tables.forEach((table) => {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
      },
      scheduleChange,
    );
  });

  void channel.subscribe();

  return () => {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
    }
    void args.client.removeChannel(channel);
  };
}

export const HOME_FEED_REALTIME_TABLES = ["posts", "comments", "friendships", "profiles"] as const;
export const PROFILE_REALTIME_TABLES = ["profiles", "posts", "comments", "friendships", "interests"] as const;
export const GALLERY_REALTIME_TABLES = ["posts", "gallery_image_likes", "profiles"] as const;
export const MEMBERS_REALTIME_TABLES = ["profiles", "friendships", "friend_requests"] as const;
