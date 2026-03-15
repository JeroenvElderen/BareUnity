-- Profile feature migration for:
-- - profile_settings enhancements (introduction + feed style defaults)
-- - follower/following relationships
-- - comments support for profile tab
-- - badge support for profile stats

begin;

-- 1) Ensure profile_settings has required columns
create table if not exists public.profile_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_primary text,
  profile_secondary text,
  avatar_url text,
  banner_url text,
  show_email boolean default false,
  show_activity boolean default true,
  allow_friend_requests boolean default true,
  feed_style text default 'balanced',
  friends jsonb default '[]'::jsonb,
  friend_requests jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_settings add column if not exists profile_primary text;
alter table public.profile_settings add column if not exists profile_secondary text;
alter table public.profile_settings add column if not exists avatar_url text;
alter table public.profile_settings add column if not exists banner_url text;
alter table public.profile_settings add column if not exists show_email boolean default false;
alter table public.profile_settings add column if not exists show_activity boolean default true;
alter table public.profile_settings add column if not exists allow_friend_requests boolean default true;
alter table public.profile_settings add column if not exists feed_style text default 'balanced';
alter table public.profile_settings add column if not exists friends jsonb default '[]'::jsonb;
alter table public.profile_settings add column if not exists friend_requests jsonb default '[]'::jsonb;
alter table public.profile_settings add column if not exists introduction text default '';
alter table public.profile_settings add column if not exists created_at timestamptz not null default now();
alter table public.profile_settings add column if not exists updated_at timestamptz not null default now();

alter table public.profile_settings add column if not exists custom_profile_url text;
alter table public.profile_settings add column if not exists vanity_slug text;
alter table public.profile_settings add column if not exists pronouns text;
alter table public.profile_settings add column if not exists communication_preferences jsonb default '["Direct messages"]'::jsonb;
alter table public.profile_settings add column if not exists profile_sections jsonb default '{"about": true, "links": true, "milestones": true, "skills": true}'::jsonb;
alter table public.profile_settings add column if not exists section_visibility jsonb default '{"about": "public", "links": "public", "milestones": "followers_only", "skills": "public", "portfolio": "public", "timeline": "followers_only"}'::jsonb;
alter table public.profile_settings add column if not exists featured_post_ids jsonb default '[]'::jsonb;
alter table public.profile_settings add column if not exists identity_badges jsonb default '[]'::jsonb;
alter table public.profile_settings add column if not exists timeline_highlights jsonb default '[]'::jsonb;

alter table public.profile_settings alter column show_email set default false;
alter table public.profile_settings alter column show_activity set default true;
alter table public.profile_settings alter column allow_friend_requests set default true;
alter table public.profile_settings alter column feed_style set default 'balanced';
alter table public.profile_settings alter column friends set default '[]'::jsonb;
alter table public.profile_settings alter column friend_requests set default '[]'::jsonb;
alter table public.profile_settings alter column introduction set default '';

-- 2) Follow graph (used for Followers/Following)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'online',
  created_at timestamptz not null default now(),
  unique (user_id, friend_user_id)
);

create index if not exists friendships_user_id_idx on public.friendships(user_id);
create index if not exists friendships_friend_user_id_idx on public.friendships(friend_user_id);

-- 3) Comments table (used for Comments tab)
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text,
  content text,
  created_at timestamptz not null default now()
);

create index if not exists comments_author_id_idx on public.comments(author_id);
create index if not exists comments_post_id_idx on public.comments(post_id);
create index if not exists comments_created_at_idx on public.comments(created_at desc);

-- 4) Badge model (used for Badges stat)
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create index if not exists user_badges_user_id_idx on public.user_badges(user_id);

-- 5) Optional RLS (adjust to your policy model)
alter table public.profile_settings enable row level security;
alter table public.friendships enable row level security;
alter table public.comments enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

-- drop-in permissive policies for authenticated users (customize as needed)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_settings' and policyname='profile_settings_select_own') then
    create policy profile_settings_select_own on public.profile_settings for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_settings' and policyname='profile_settings_upsert_own') then
    create policy profile_settings_upsert_own on public.profile_settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='friendships' and policyname='friendships_select_related') then
    create policy friendships_select_related on public.friendships for select to authenticated using (auth.uid() = user_id or auth.uid() = friend_user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='comments' and policyname='comments_select_all_auth') then
    create policy comments_select_all_auth on public.comments for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='comments' and policyname='comments_insert_own') then
    create policy comments_insert_own on public.comments for insert to authenticated with check (auth.uid() = author_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='badges' and policyname='badges_select_all_auth') then
    create policy badges_select_all_auth on public.badges for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_badges' and policyname='user_badges_select_own') then
    create policy user_badges_select_own on public.user_badges for select to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- 6) Storage policies for profile media (avatar/banner uploads)
-- Expected bucket: public.profile-media
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='profile_media_read_public'
  ) then
    create policy profile_media_read_public
      on storage.objects
      for select
      to public
      using (bucket_id = 'profile-media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='profile_media_insert_own'
  ) then
    create policy profile_media_insert_own
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'profile-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='profile_media_update_own'
  ) then
    create policy profile_media_update_own
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'profile-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      )
      with check (
        bucket_id = 'profile-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='profile_media_delete_own'
  ) then
    create policy profile_media_delete_own
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'profile-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;

commit;
