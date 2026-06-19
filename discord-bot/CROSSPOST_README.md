# Discord → BareUnity → Reddit crosspost setup

This document lists what is needed to run the BareUnity crosspost flow:

1. A moderator opts a Discord member in with `/register @member`.
2. New threads in the configured Discord forum are sent to the BareUnity website.
3. If the Discord member is linked to a BareUnity profile, the website post uses that profile.
4. If the Discord member is not linked, the website post uses the BareUnity fallback profile.
5. The Discord bot can optionally submit the created BareUnity post URL to Reddit.

## Current defaults

| Setting | Default |
| --- | --- |
| Discord forum channel | `1515845739870425208` |
| BareUnity fallback profile ID | `00e59273-e45d-4528-b05a-74c4075e6035` |
| BareUnity fallback profile username | `BareUnity` |
| Owner Discord user ID | `946346329783803945` |
| Owner BareUnity profile ID | `d0eb25c5-5a45-46c2-827c-17a00ebe8343` |
| BareUnity API base URL | `https://bareunity.com` |

## Supabase setup

Before enabling the bot, run this SQL file in Supabase:

```text
supabase-discord-crosspost.sql
```

It creates these integration tables:

- `profile_discord_identities`
- `discord_crosspost_registrations`
- `discord_reddit_crosspost_sync`

The integration tables are intended for server-side service-role access only.

## Vercel (website)

Set these environment variables in the BareUnity Vercel project.

Go to:

```text
Vercel → BareUnity project → Settings → Environment Variables
```

### Required Vercel variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
DISCORD_CROSSPOST_SECRET=make-this-a-long-random-secret
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL used by the server-side admin client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key used by the server-side integration routes. Keep this secret. |
| `DISCORD_CROSSPOST_SECRET` | Shared secret expected by the website API in the `x-bareunity-discord-secret` header. This must match `BAREUNITY_DISCORD_SECRET` on Railway. |

### Recommended Vercel variables

```env
DISCORD_CROSSPOST_FORUM_ID=1515845739870425208
NEXT_PUBLIC_SITE_URL=https://bareunity.com
FALLBACK_CROSSPOST_AUTHOR_ID=00e59273-e45d-4528-b05a-74c4075e6035
CROSSPOST_OWNER_DISCORD_USER_ID=946346329783803945
CROSSPOST_OWNER_PROFILE_ID=d0eb25c5-5a45-46c2-827c-17a00ebe8343
```

| Variable | Purpose |
| --- | --- |
| `DISCORD_CROSSPOST_FORUM_ID` | The only Discord forum channel ID accepted by the website API. Defaults to `1515845739870425208`. |
| `NEXT_PUBLIC_SITE_URL` | Used to build the BareUnity post URL returned to the bot and submitted to Reddit. |
| `FALLBACK_CROSSPOST_AUTHOR_ID` | Profile ID to use when an opted-in Discord member has no linked BareUnity account. Defaults to the `BareUnity` profile. |
| `CROSSPOST_OWNER_DISCORD_USER_ID` | Discord user ID that should always post under the owner BareUnity profile. Defaults to `946346329783803945`. |
| `CROSSPOST_OWNER_PROFILE_ID` | BareUnity/Supabase profile UUID used for that owner Discord user. Defaults to `d0eb25c5-5a45-46c2-827c-17a00ebe8343`. |

Owner posts are special: when Discord user `946346329783803945` posts in the crosspost forum, the website post is created directly under BareUnity/Supabase profile `d0eb25c5-5a45-46c2-827c-17a00ebe8343`, even if that Discord user was not registered through `/register`.

## Railway.com (bot host)

Set these environment variables in the Railway service that runs the Python Discord bot.

Go to:

```text
Railway → Discord bot service → Variables
```

### Required Railway variables for Discord and BareUnity posting

```env
DISCORD_TOKEN=your-discord-bot-token
BAREUNITY_API_BASE_URL=https://bareunity.com
BAREUNITY_DISCORD_SECRET=make-this-a-long-random-secret
DISCORD_CROSSPOST_FORUM_ID=1515845739870425208
```

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Discord bot token. |
| `BAREUNITY_API_BASE_URL` | Base URL for the BareUnity website API. Use `http://localhost:3000` only for local testing. |
| `BAREUNITY_DISCORD_SECRET` | Shared secret sent to the website API. This must match `DISCORD_CROSSPOST_SECRET` on Vercel. |
| `DISCORD_CROSSPOST_FORUM_ID` | Forum channel the bot listens to. Defaults to `1515845739870425208`. |

The bot also accepts `DISCORD_CROSSPOST_SECRET` as a fallback if `BAREUNITY_DISCORD_SECRET` is not set, but `BAREUNITY_DISCORD_SECRET` is clearer for Railway deployments.

### Optional Railway variables for Reddit posting

Set these only if you want automatic Reddit submissions.

```env
REDDIT_CLIENT_ID=your-reddit-client-id
REDDIT_CLIENT_SECRET=your-reddit-client-secret
REDDIT_USERNAME=BareUnityBot
REDDIT_PASSWORD=your-reddit-bot-password
REDDIT_USER_AGENT=BareUnityDiscordCrosspostBot/1.0 by u/BareUnityBot
REDDIT_SUBREDDIT=BareUnity
```

| Variable | Purpose |
| --- | --- |
| `REDDIT_CLIENT_ID` | Client ID from the Reddit app page. |
| `REDDIT_CLIENT_SECRET` | Client secret from the Reddit app page. |
| `REDDIT_USERNAME` | Reddit bot account username. |
| `REDDIT_PASSWORD` | Reddit bot account password. |
| `REDDIT_USER_AGENT` | Reddit API user agent. Use a descriptive value. |
| `REDDIT_SUBREDDIT` | Target subreddit name without `/r/`. |

If the Reddit variables are missing, Discord → BareUnity website posting can still work, but Reddit submission is skipped.

## Quick copy/paste env blocks

### Vercel website

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
DISCORD_CROSSPOST_SECRET=make-this-a-long-random-secret
DISCORD_CROSSPOST_FORUM_ID=1515845739870425208
NEXT_PUBLIC_SITE_URL=https://bareunity.com
FALLBACK_CROSSPOST_AUTHOR_ID=00e59273-e45d-4528-b05a-74c4075e6035
CROSSPOST_OWNER_DISCORD_USER_ID=946346329783803945
CROSSPOST_OWNER_PROFILE_ID=d0eb25c5-5a45-46c2-827c-17a00ebe8343
```

### Railway bot host, without Reddit

```env
DISCORD_TOKEN=your-discord-bot-token
BAREUNITY_API_BASE_URL=https://bareunity.com
BAREUNITY_DISCORD_SECRET=make-this-a-long-random-secret
DISCORD_CROSSPOST_FORUM_ID=1515845739870425208
```

### Railway bot host, with Reddit

```env
DISCORD_TOKEN=your-discord-bot-token
BAREUNITY_API_BASE_URL=https://bareunity.com
BAREUNITY_DISCORD_SECRET=make-this-a-long-random-secret
DISCORD_CROSSPOST_FORUM_ID=1515845739870425208
REDDIT_CLIENT_ID=your-reddit-client-id
REDDIT_CLIENT_SECRET=your-reddit-client-secret
REDDIT_USERNAME=BareUnityBot
REDDIT_PASSWORD=your-reddit-bot-password
REDDIT_USER_AGENT=BareUnityDiscordCrosspostBot/1.0 by u/BareUnityBot
REDDIT_SUBREDDIT=BareUnity
```

## Reddit app setup

1. Log into the Reddit bot account.
2. Open `https://www.reddit.com/prefs/apps`.
3. Create an app of type `script`.
4. Use a redirect URI such as `http://localhost:8080`.
5. Copy the client ID and client secret into the bot environment.
6. Make sure the bot account can post in the target subreddit.

## Python dependencies

Install the bot requirements after updating the environment:

```bash
pip install -r discord-bot/requirements.txt
```

The crosspost cog requires `aiohttp` for BareUnity API calls and `praw` for Reddit submissions.

## Moderator workflow

After deploying the website and bot:

1. A member asks a moderator to enable crossposting.
2. The moderator runs:

```text
/register @member
```

3. If the member has a Discord-linked BareUnity account, posts are attributed to that profile.
4. If the member has no Discord-linked BareUnity account, posts are attributed to the `BareUnity` fallback profile and include a note that the post came from a BareUnity Discord member.

## Minimum setup without Reddit

For a first test, you can skip all Reddit variables.

Vercel website:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
DISCORD_CROSSPOST_SECRET=make-this-a-long-random-secret
NEXT_PUBLIC_SITE_URL=https://bareunity.com
FALLBACK_CROSSPOST_AUTHOR_ID=00e59273-e45d-4528-b05a-74c4075e6035
CROSSPOST_OWNER_DISCORD_USER_ID=946346329783803945
CROSSPOST_OWNER_PROFILE_ID=d0eb25c5-5a45-46c2-827c-17a00ebe8343
```

Railway bot host:

```env
DISCORD_TOKEN=your-discord-bot-token
BAREUNITY_API_BASE_URL=https://bareunity.com
BAREUNITY_DISCORD_SECRET=make-this-a-long-random-secret
DISCORD_CROSSPOST_FORUM_ID=1515845739870425208
```

Then test:

1. Run `/register @member` as a moderator.
2. Create a new forum thread in channel `1515845739870425208` as that member.
3. Confirm a BareUnity website post is created.
4. Add Reddit variables later when website posting is confirmed.