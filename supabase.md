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

## Supabase Auth email confirmation with PrivateEmail

BareUnity uses Supabase Auth exclusively for account creation and email
confirmation. Do not create `public.User`, Auth.js, or Prisma user rows. Public
registration calls `supabase.auth.signUp()`, and Supabase sends the confirmation
message when email confirmations are enabled.

To send verification email through PrivateEmail, configure SMTP in Supabase:

1. Open Supabase Dashboard > Authentication > SMTP.
2. Enable custom SMTP.
3. Use `mail.privateemail.com` with your PrivateEmail mailbox credentials.
4. Use port `587` for STARTTLS, or port `465` for TLS, matching your mailbox
   settings.
5. Set the sender address to the verified PrivateEmail address you want members
   to see.

The app's `SMTP_*` environment variables are only for BareUnity-owned welcome
emails. They are not used to generate custom verification links.

## TeamNaturist invite-code registration setup

For the TeamNaturist Discord invite flow, run
`supabase-teamnaturist-invite-codes.sql` in the Supabase SQL editor. The app
checks both tables before creating an invite-based verified account:

- `public.invite_codes.code_text` — the reusable invite text. Codes are
  unlimited; there is no `pending`/`used` state.
- `public.teamnaturist.username` — the exact Discord username TeamNaturist gave
  you for the allowlist.

Create a reusable invite code and allowlisted Discord usernames with direct
inserts:

```sql
insert into public.invite_codes (code_text, partner_name)
values ('TEAMNATURIST-2026', 'TeamNaturist Discord')
on conflict (code_text) do update set partner_name = excluded.partner_name;

insert into public.teamnaturist (username)
values ('teamnaturist_member')
on conflict (username) do nothing;
```

When someone registers through `/register?invite=TEAMNATURIST-2026`, the server
validates that the invite code exists and that the submitted Discord username is
in `public.teamnaturist`. The code is not consumed, so it can be reused.

## SQL files

- `supabase-channel-only.sql` — canonical reset/migration for Discord-style channel schema.
- `supabase-channel-reset.sql` — alias of the same canonical script.
- `supabase-channels-migration.sql` — alias of the same canonical script.
- `supabase-brand-mode.sql` — alias of the same canonical script.
- `supabase-teamnaturist-invite-codes.sql` — creates reusable TeamNaturist invite codes plus the Discord username allowlist table.
- `supabase-registration-invite-codes.sql` — legacy hashed invite-code registration tables and RPC helpers.
