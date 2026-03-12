# BareUnity Supabase (Discord-style channels)

This project is channel-only. Use `supabase-channel-only.sql` to:

1. Drop all `communities` / `community_*` tables.
2. Remove `public.channel_rooms` (no nested rooms).
3. Create/upgrade `public.channels` with Discord-like top-level channels and ordering:
   - `content_type` (`forum`, `map`, `feed`, `events`, `custom`)
   - `content_config` (JSON settings per channel, e.g. map bounds, forum filters, embed URL)
   - `position` (sidebar order)
   - `is_enabled` (hide/show channel)
   - `icon_url` (channel icon)
4. Ensure content uses `channel_id` in `posts` and `events`.
5. Apply secure RLS policies:
   - authenticated users can read channels
   - only `service_role` can create/update/delete channels

## SQL files

- `supabase-channel-only.sql` — canonical reset/migration for Discord-style channel schema.
- `supabase-channel-reset.sql` — alias of the same canonical script.
- `supabase-channels-migration.sql` — alias of the same canonical script.
- `supabase-brand-mode.sql` — alias of the same canonical script.
