-- BareUnity <-> Discord live post/comment/like sync support.

alter table if exists public.discord_reddit_crosspost_sync
  add column if not exists target_discord_channel_id text,
  add column if not exists website_post_url text;

create unique index if not exists discord_reddit_crosspost_sync_website_post_id_key
  on public.discord_reddit_crosspost_sync(website_post_id)
  where website_post_id is not null;

create table if not exists public.discord_crosspost_events (
  id uuid primary key default gen_random_uuid(),
  website_post_id uuid not null references public.posts(id) on delete cascade,
  discord_thread_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists discord_crosspost_events_pending_idx
  on public.discord_crosspost_events(created_at)
  where processed_at is null;

create table if not exists public.discord_crosspost_comment_sync (
  id uuid primary key default gen_random_uuid(),
  website_post_id uuid not null references public.posts(id) on delete cascade,
  website_comment_id uuid references public.comments(id) on delete cascade,
  discord_thread_id text not null,
  discord_message_id text not null unique,
  discord_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists discord_crosspost_comment_sync_post_idx
  on public.discord_crosspost_comment_sync(website_post_id);

alter table public.discord_crosspost_events enable row level security;
alter table public.discord_crosspost_comment_sync enable row level security;
