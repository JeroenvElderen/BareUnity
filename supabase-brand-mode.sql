-- BareUnity single-brand mode (Supabase SQL)
-- Run in Supabase SQL editor as a migration.
-- Goal: use one fixed workspace and channel system; disable creating additional communities/servers.

begin;

-- 1) Platform singleton config
create table if not exists public.platform_settings (
  id boolean primary key default true check (id = true),
  brand_mode boolean not null default true,
  allow_user_community_creation boolean not null default false,
  primary_community_id uuid null references public.communities(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id)
values (true)
on conflict (id) do nothing;

-- 2) Helper: identify platform admins (owners/admins/managers in primary community)
create or replace function public.is_platform_admin(check_user uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.platform_settings ps
    join public.community_memberships cm
      on cm.community_id = ps.primary_community_id
    where ps.id = true
      and cm.profile_id = check_user
      and cm.role in ('owner', 'admin', 'manager')
  );
$$;

-- 3) RLS setup
alter table public.communities enable row level security;
alter table public.community_channels enable row level security;
alter table public.community_memberships enable row level security;

-- 4) Communities policies (single-brand)
drop policy if exists "communities_select_all" on public.communities;
create policy "communities_select_all"
on public.communities
for select
using (true);

drop policy if exists "communities_insert_disabled" on public.communities;
create policy "communities_insert_disabled"
on public.communities
for insert
to authenticated
with check (false);

drop policy if exists "communities_update_primary_only" on public.communities;
create policy "communities_update_primary_only"
on public.communities
for update
to authenticated
using (
  id = (select primary_community_id from public.platform_settings where id = true)
  and public.is_platform_admin(auth.uid())
)
with check (
  id = (select primary_community_id from public.platform_settings where id = true)
  and public.is_platform_admin(auth.uid())
);

drop policy if exists "communities_delete_disabled" on public.communities;
create policy "communities_delete_disabled"
on public.communities
for delete
to authenticated
using (false);

-- 5) Channels policies (only for primary community)
drop policy if exists "channels_select_primary" on public.community_channels;
create policy "channels_select_primary"
on public.community_channels
for select
using (
  community_id = (select primary_community_id from public.platform_settings where id = true)
);

drop policy if exists "channels_manage_admins_primary" on public.community_channels;
create policy "channels_manage_admins_primary"
on public.community_channels
for all
to authenticated
using (
  community_id = (select primary_community_id from public.platform_settings where id = true)
  and public.is_platform_admin(auth.uid())
)
with check (
  community_id = (select primary_community_id from public.platform_settings where id = true)
  and public.is_platform_admin(auth.uid())
);

-- 6) Membership policies
-- Members can read memberships for the primary community.
drop policy if exists "memberships_select_primary" on public.community_memberships;
create policy "memberships_select_primary"
on public.community_memberships
for select
to authenticated
using (
  community_id = (select primary_community_id from public.platform_settings where id = true)
);

-- Join is allowed only for the primary community.
drop policy if exists "memberships_join_primary" on public.community_memberships;
create policy "memberships_join_primary"
on public.community_memberships
for insert
to authenticated
with check (
  community_id = (select primary_community_id from public.platform_settings where id = true)
  and profile_id = auth.uid()
);

-- Admins can manage memberships only inside the primary community.
drop policy if exists "memberships_admin_manage_primary" on public.community_memberships;
create policy "memberships_admin_manage_primary"
on public.community_memberships
for all
to authenticated
using (
  community_id = (select primary_community_id from public.platform_settings where id = true)
  and public.is_platform_admin(auth.uid())
)
with check (
  community_id = (select primary_community_id from public.platform_settings where id = true)
  and public.is_platform_admin(auth.uid())
);

commit;
