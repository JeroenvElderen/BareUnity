-- BareUnity Discord-style channel schema reset
-- Community hub with top-level channels only (no channel_rooms)
-- Each channel can render a different experience (map, forum, feed, custom app, etc.)

begin;

create extension if not exists pgcrypto;

-- 1) Drop all tables that contain legacy community naming
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (tablename = 'communities' OR tablename LIKE 'community_%')
  LOOP
    EXECUTE format('drop table if exists public.%I cascade', t.tablename);
  END LOOP;
END $$;

-- 2) Remove room-based model (we are channel-only)
drop table if exists public.channel_rooms cascade;

-- 3) Top-level channels with per-channel experience metadata
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  icon_url text,
  privacy text not null default 'public' check (privacy in ('public', 'private', 'restricted')),
  join_mode text not null default 'open' check (join_mode in ('open', 'approval', 'invite_only')),
  content_type text not null default 'forum',
  content_config jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  is_enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  featured boolean not null default false,
  verified boolean not null default false,
  mature boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill/compat for older schemas
alter table public.channels add column if not exists icon_url text;
alter table public.channels add column if not exists content_type text;
alter table public.channels add column if not exists content_config jsonb;
alter table public.channels add column if not exists position integer;
alter table public.channels add column if not exists is_enabled boolean;

update public.channels
set content_type = coalesce(nullif(content_type, ''), 'forum')
where content_type is null or content_type = '';

update public.channels
set content_config = coalesce(content_config, '{}'::jsonb)
where content_config is null;

update public.channels
set position = coalesce(position, 0)
where position is null;

update public.channels
set is_enabled = coalesce(is_enabled, true)
where is_enabled is null;

alter table public.channels alter column content_type set default 'forum';
alter table public.channels alter column content_type set not null;
alter table public.channels alter column content_config set default '{}'::jsonb;
alter table public.channels alter column content_config set not null;
alter table public.channels alter column position set default 0;
alter table public.channels alter column position set not null;
alter table public.channels alter column is_enabled set default true;
alter table public.channels alter column is_enabled set not null;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'channels_content_type_check'
      AND conrelid = 'public.channels'::regclass
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_content_type_check
      CHECK (content_type in ('forum', 'map', 'feed', 'events', 'custom'));
  END IF;
END $$;

create index if not exists channels_slug_idx on public.channels(slug);
create index if not exists channels_position_idx on public.channels(position, name);
create index if not exists channels_enabled_idx on public.channels(is_enabled);

-- 4) Ensure posts/events use channel_id
DO $$
BEGIN
  IF to_regclass('public.posts') is not null
    AND exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='community_id')
    AND not exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='channel_id')
  THEN
    ALTER TABLE public.posts RENAME COLUMN community_id TO channel_id;
  END IF;

  IF to_regclass('public.events') is not null
    AND exists (select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='community_id')
    AND not exists (select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='channel_id')
  THEN
    ALTER TABLE public.events RENAME COLUMN community_id TO channel_id;
  END IF;
END $$;

DO $$
BEGIN
  IF exists (select 1 from pg_constraint where conname = 'posts_community_id_fkey') THEN
    alter table public.posts drop constraint posts_community_id_fkey;
  END IF;
  IF exists (select 1 from pg_constraint where conname = 'events_community_id_fkey') THEN
    alter table public.events drop constraint events_community_id_fkey;
  END IF;

  IF to_regclass('public.posts') is not null
    AND exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='channel_id')
    AND not exists (select 1 from pg_constraint where conname = 'posts_channel_id_fkey')
  THEN
    alter table public.posts
      add constraint posts_channel_id_fkey foreign key (channel_id) references public.channels(id) on delete set null;
  END IF;

  IF to_regclass('public.events') is not null
    AND exists (select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='channel_id')
    AND not exists (select 1 from pg_constraint where conname = 'events_channel_id_fkey')
  THEN
    alter table public.events
      add constraint events_channel_id_fkey foreign key (channel_id) references public.channels(id) on delete set null;
  END IF;
END $$;

create index if not exists posts_channel_idx on public.posts(channel_id);
create index if not exists events_channel_idx on public.events(channel_id);

-- 5) Platform settings
create table if not exists public.platform_settings (
  id boolean primary key default true,
  brand_mode boolean not null default true,
  primary_channel_id uuid null references public.channels(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings
  add column if not exists primary_channel_id uuid null references public.channels(id) on delete set null;

insert into public.platform_settings (id)
values (true)
on conflict (id) do nothing;

-- 6) RLS: read for authenticated users, writes for service role only
alter table public.channels enable row level security;

drop policy if exists "channels_read_authenticated" on public.channels;
create policy "channels_read_authenticated"
on public.channels
for select
using (auth.uid() is not null);

drop policy if exists "channels_write_service_only" on public.channels;
create policy "channels_write_service_only"
on public.channels
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

commit;
