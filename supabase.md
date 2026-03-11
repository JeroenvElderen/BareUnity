# BareUnity Supabase (Channel-only)

This project is channel-only. Use `supabase-channel-only.sql` to:

1. Drop all `communities` / `community_*` tables.
2. Create channel tables:
   - `public.channels`
   - `public.channel_rooms`
3. Ensure content uses `channel_id` in `posts` and `events`.
4. Apply secure RLS policies:
   - authenticated users can read channels/rooms
   - only `service_role` can create/update/delete channels/rooms

## SQL files

- `supabase-channel-only.sql` — canonical reset/migration for channel-only schema.
- `supabase-channel-reset.sql` — alias of the same canonical script.
- `supabase-channels-migration.sql` — alias of the same canonical script.
- `supabase-brand-mode.sql` — alias of the same canonical script.
