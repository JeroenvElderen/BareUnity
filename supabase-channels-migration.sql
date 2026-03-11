-- BareUnity channel-only schema reset
-- Drops all legacy community tables and provisions channel tables + RLS.

begin;

create extension if not exists pgcrypto;

-- 1) Drop all tables that contain community naming
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

-- 2) Channel tables
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  privacy text not null default 'public' check (privacy in ('public', 'private', 'restricted')),
  join_mode text not null default 'open' check (join_mode in ('open', 'approval', 'invite_only')),
  created_by uuid references public.profiles(id) on delete set null,
  featured boolean not null default false,
  verified boolean not null default false,
  mature boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_rooms (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  name text not null,
  kind text not null default 'text' check (kind in ('text', 'voice', 'stage')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (channel_id, kind, name)
);

create index if not exists channels_slug_idx on public.channels(slug);
create index if not exists channel_rooms_channel_idx on public.channel_rooms(channel_id);

-- 3) Ensure posts/events use channel_id
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

-- 4) Platform settings
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

-- 5) RLS: read for authenticated users, writes for service role only
alter table public.channels enable row level security;
alter table public.channel_rooms enable row level security;

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

drop policy if exists "channel_rooms_read_authenticated" on public.channel_rooms;
create policy "channel_rooms_read_authenticated"
on public.channel_rooms
for select
using (auth.uid() is not null);

drop policy if exists "channel_rooms_write_service_only" on public.channel_rooms;
create policy "channel_rooms_write_service_only"
on public.channel_rooms
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

commit;
