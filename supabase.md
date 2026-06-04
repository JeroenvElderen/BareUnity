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

If your Supabase project does not have invite-code tables yet, run the full
`supabase-registration-invite-codes.sql` file in the Supabase SQL editor. That
script creates `public.registration_invite_codes`,
`public.registration_invite_code_redemptions`, and the helper RPCs used by
`/register?invite`.

After the script has run, create a raw invite code with:

```sql
select * from public.create_registration_invite_code(
  p_raw_code := 'BARE-PARTNER-2026',
  p_label := 'Partner 2026 pilot',
  p_partner_name := 'Trusted verification partner name',
  p_max_uses := 1,
  p_expires_at := now() + interval '30 days'
);
```

Give only the raw `p_raw_code` value to the invited person. The database stores
only its SHA-256 hash.

## SQL files

- `supabase-channel-only.sql` — canonical reset/migration for Discord-style channel schema.
- `supabase-channel-reset.sql` — alias of the same canonical script.
- `supabase-channels-migration.sql` — alias of the same canonical script.
- `supabase-brand-mode.sql` — alias of the same canonical script.
- `supabase-registration-invite-codes.sql` — creates invite-code registration tables, redemption auditing, and helper RPCs.
