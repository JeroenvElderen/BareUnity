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

## Invite-code registration setup

For the simplified invite-code flow, run `supabase-simple-invite-codes.sql` in
the Supabase SQL editor. The app now reads `public.invite_codes`, which has only
these two columns:

- `code_text` — the exact custom invite text you create and give to a person.
- `status` — `pending` for unused invites or `used` after registration.

Create invite codes with direct inserts:

```sql
insert into public.invite_codes (code_text, status)
values ('My custom invite text', 'pending');
```

When someone registers through `/register?invite=My%20custom%20invite%20text`,
the server validates the row is `pending` and marks it `used` after the verified
account is created.

## SQL files

- `supabase-channel-only.sql` — canonical reset/migration for Discord-style channel schema.
- `supabase-channel-reset.sql` — alias of the same canonical script.
- `supabase-channels-migration.sql` — alias of the same canonical script.
- `supabase-brand-mode.sql` — alias of the same canonical script.
- `supabase-simple-invite-codes.sql` — creates the simplified two-column invite-code table (`code_text`, `status`).
- `supabase-registration-invite-codes.sql` — legacy hashed invite-code registration tables and RPC helpers.
