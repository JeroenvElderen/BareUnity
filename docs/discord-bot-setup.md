# Discord bot setup for TeamNaturist registration

BareUnity uses Discord OAuth for the member identity and a Discord bot token for the server/role check. Users do not need an invite code in the Discord path: they enter their full name and BareUnity username, sign in with Discord, and the app checks the live Discord server to confirm that account is in the TeamNaturist guild with an approved role.

## 1. Create the Discord application and bot

1. Open the Discord Developer Portal.
2. Create a new application, or use the same application that provides Discord OAuth.
3. Open **Bot** and choose **Add Bot**.
4. Copy the bot token into `DISCORD_BOT_TOKEN` on the server. Never expose this token in browser code.
5. Enable **Server Members Intent** under privileged gateway intents so the app can read guild member details.

## 2. Invite the bot to TeamNaturist

1. Open **OAuth2 → URL Generator** for the Discord application.
2. Select the `bot` scope.
3. Select the minimum permission needed to view guild members, or invite without extra moderation permissions if the server permissions already allow member reads.
4. Open the generated URL and invite the bot to guild `1130957278472835234`.
5. Keep the bot in the server; removing it makes Discord registration fail.

## 3. Configure BareUnity environment variables

Set these server-side environment variables:

```env
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_TEAMNATURIST_GUILD_ID=1130957278472835234
DISCORD_TEAMNATURIST_ROLE_IDS=1131278113167388742,1131284261748625510,1130958613008089128,1171098977043755138
```

The role list is comma-separated. A Discord-authenticated registration must have at least one of those roles.

## 4. Configure Discord OAuth

Discord OAuth must still be enabled in Supabase Auth with the Discord Client ID and Client Secret. Add this redirect URL in the Discord OAuth2 redirects:

```text
https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
```

Also allow your app callback URL in Supabase Auth URL settings, for example:

```text
https://your-domain.com/register
```

## 5. Registration source of truth

Discord invite registration checks the live TeamNaturist server membership and role list through the Discord API. It does not require a pre-approved Supabase invite/redemption row for Discord signups. Supabase Auth still stores the Discord identity on the created account, and the app creates the BareUnity `profiles` and `profile_settings` rows only after the Discord server role check passes.

## 6. Why Supabase activity may not appear in Discord

The web app does **not** call Discord directly when a post, gallery upload, comment, like, or profile is created. Instead, it writes work items into `public.discord_crosspost_events`. A separate Discord bot/worker must poll:

```text
GET /api/integrations/discord/crosspost/events
```

with the `x-bareunity-discord-secret` header matching `DISCORD_CROSSPOST_SECRET`, publish the event to Discord, and then acknowledge it with:

```text
POST /api/integrations/discord/crosspost/events
{ "action": "mark-processed", "eventId": "..." }
```

If Discord stays silent while Supabase rows are being created, check these items in order:

1. `supabase-discord-crosspost-live-sync.sql` has been applied so `public.discord_crosspost_events` exists.
2. `DISCORD_CROSSPOST_SECRET` is configured in the app and the bot sends the same value in `x-bareunity-discord-secret`.
3. The bot/worker process is actually running and polling `/api/integrations/discord/crosspost/events`.
4. The bot maps event types such as `website_post_created`, `gallery_image_review_requested`, `profile_review_requested`, `admin_report_created`, `admin_feedback_created`, `admin_location_request_created`, `admin_country_update_request_created`, and `admin_verification_request_created` to the correct Discord forum/channel IDs.
5. Rows in `public.discord_crosspost_events` have `processed_at is null`; if they also have a non-null `error`, inspect that error because the bot reported a failed publish attempt.

New BareUnity profile registrations enqueue a `profile_review_requested` event for the case-management channel. Admin workflows enqueue `admin_*` events for reports, feedback, location requests, country update requests, and verification applications. The bot still needs handlers for those event types before the corresponding cards will appear in Discord.
