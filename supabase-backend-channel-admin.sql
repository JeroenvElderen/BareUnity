-- BareUnity: backend channel manager requirements
-- Run this in Supabase SQL editor before using /backend channel admin UI.

begin;

create extension if not exists pgcrypto;

-- 1) Channels table expected by the app/admin API.
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  icon_url text,
  privacy text not null default 'public' check (privacy in ('public', 'private', 'restricted')),
  join_mode text not null default 'open' check (join_mode in ('open', 'approval', 'invite_only')),
  content_type text not null default 'custom' check (content_type in ('forum', 'map', 'feed', 'events', 'custom')),
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

-- 2) Backward-compatible columns for older schemas.
alter table public.channels add column if not exists icon_url text;
alter table public.channels add column if not exists content_type text;
alter table public.channels add column if not exists content_config jsonb;
alter table public.channels add column if not exists position integer;
alter table public.channels add column if not exists is_enabled boolean;

update public.channels
set content_type = coalesce(nullif(content_type, ''), 'custom')
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

alter table public.channels alter column content_type set default 'custom';
alter table public.channels alter column content_type set not null;
alter table public.channels alter column content_config set default '{}'::jsonb;
alter table public.channels alter column content_config set not null;
alter table public.channels alter column position set default 0;
alter table public.channels alter column position set not null;
alter table public.channels alter column is_enabled set default true;
alter table public.channels alter column is_enabled set not null;

-- 3) Helpful indexes.
create index if not exists channels_slug_idx on public.channels(slug);
create index if not exists channels_position_idx on public.channels(position, name);
create index if not exists channels_enabled_idx on public.channels(is_enabled);

-- 4) RLS setup expected by the backend API design.
-- Reads: authenticated users
-- Writes: service role only (API route uses SUPABASE_SERVICE_ROLE_KEY server-side)
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

-- 5) Seed defaults used by current frontend mapping (optional but recommended).
insert into public.channels (name, slug, content_type, content_config, position, is_enabled)
values
  ('General Nature', 'general-nature', 'custom', '{"component_key":"general"}'::jsonb, 0, true),
  ('Retreats', 'retreats', 'custom', '{"component_key":"retreats"}'::jsonb, 1, true),
  ('Mindful Living', 'mindful-living', 'custom', '{"component_key":"mindful"}'::jsonb, 2, true)
on conflict (slug) do update
set
  name = excluded.name,
  content_type = excluded.content_type,
  content_config = excluded.content_config,
  position = excluded.position,
  is_enabled = excluded.is_enabled,
  updated_at = now();

commit;
