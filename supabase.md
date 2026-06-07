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

## App-owned auth and lifecycle emails

BareUnity uses Supabase Auth for account state, verification tokens, password
recovery tokens, and auth user deletion. The emails themselves are sent by the
app through `src/lib/email.ts` with BareUnity SMTP branding. Do not create
`public.User`, Auth.js, or Prisma user rows.

The registration endpoint calls `supabase.auth.admin.generateLink({ type:
"signup" })` to create the Supabase Auth user and receive a confirmation link
without asking Supabase to send the email. The app then sends one combined
BareUnity welcome + confirmation email with that link. Password recovery uses
`generateLink({ type: "recovery" })` the same way, so reset emails also come
from `email.ts`.

The shared email renderer currently covers welcome + confirmation, password
reset, account-deletion goodbye, and verification approved/rejected decisions.

Configure the app SMTP environment variables for all BareUnity-owned emails:

1. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`.
2. Optionally set `EMAIL_LOGO_URL` to replace the default BareUnity email logo.
3. Keep `SUPABASE_SERVICE_ROLE_KEY` configured so trusted server routes can
   generate Supabase Auth links and update/delete users.

Supabase Dashboard email templates are not the source of truth for BareUnity
emails. They should only be considered a fallback if an auth flow is later moved
back to Supabase-managed sending.

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
