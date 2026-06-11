create table if not exists public.country_discovery_profiles (
  slug text primary key,
  name text not null,
  flag text,
  continent text,
  tagline text,
  hero_image text,
  legal_status text,
  beaches_count text,
  resorts_count text,
  community_rating text,
  community_members text,
  glance jsonb not null default '{}'::jsonb,
  culture_scores jsonb not null default '{}'::jsonb,
  laws jsonb not null default '[]'::jsonb,
  first_time_tips jsonb not null default '[]'::jsonb,
  etiquette jsonb not null default '[]'::jsonb,
  best_time text,
  regions jsonb not null default '[]'::jsonb,
  beaches jsonb not null default '[]'::jsonb,
  season jsonb not null default '{}'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.country_update_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  country_slug text not null,
  country_name text not null,
  change_type text not null check (change_type in ('laws', 'beach', 'resort', 'safety', 'season', 'general')),
  message text not null,
  source_url text,
  page_url text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.country_discovery_profiles enable row level security;
alter table public.country_update_requests enable row level security;

drop policy if exists "Country profiles are publicly readable" on public.country_discovery_profiles;
create policy "Country profiles are publicly readable"
  on public.country_discovery_profiles for select
  using (true);

drop policy if exists "Country update requests are insertable by authenticated users" on public.country_update_requests;
create policy "Country update requests are insertable by authenticated users"
  on public.country_update_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

create index if not exists country_discovery_profiles_name_idx
  on public.country_discovery_profiles (name);

create index if not exists country_update_requests_country_status_idx
  on public.country_update_requests (country_slug, status, created_at desc);
