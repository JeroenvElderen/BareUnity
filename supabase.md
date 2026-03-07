# Supabase Schema

This document captures the provided PostgreSQL / Supabase schema for the `public` schema, with the duplicate `community_memberships` definition consolidated into a single section.

## Notes

- `community_memberships` was included twice in the source input. This file keeps a single canonical definition.
- `community_channels` and `community_memberships` were marked as needing policies, so example RLS policies are included below.
- The SQL below assumes `pgcrypto` is enabled for `gen_random_uuid()`.

## Core Tables

### `public.profiles`

```sql
create table public.profiles (
  id uuid not null,
  username text not null,
  display_name text null,
  bio text null,
  avatar_url text null,
  location text null,
  created_at timestamp with time zone null default now(),
  profile_primary_color text null default '#345f45'::text,
  profile_secondary_color text null default '#1f3326'::text,
  show_email boolean null default false,
  show_activity boolean null default true,
  allow_friend_requests boolean null default true,
  constraint profiles_pkey primary key (id),
  constraint profiles_username_key unique (username),
  constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade
) tablespace pg_default;
```

### `public.communities`

```sql
create table public.communities (
  id uuid not null default gen_random_uuid(),
  name text not null,
  description text null,
  banner_url text null,
  created_by uuid null,
  created_at timestamp with time zone null default now(),
  slug text null,
  privacy text not null default 'public'::text,
  mature boolean not null default false,
  theme_primary text not null default '#ff5a0a'::text,
  theme_secondary text not null default '#340b05'::text,
  constraint communities_pkey primary key (id),
  constraint communities_name_key unique (name),
  constraint communities_slug_key unique (slug),
  constraint communities_created_by_fkey foreign key (created_by) references profiles (id),
  constraint communities_privacy_check check (
    privacy = any (array['public'::text, 'restricted'::text, 'private'::text])
  )
) tablespace pg_default;
```

### `public.community_channels`

```sql
create table public.community_channels (
  id uuid not null default gen_random_uuid(),
  community_id uuid not null,
  kind text not null,
  name text not null,
  created_by uuid null,
  created_at timestamp with time zone not null default now(),
  constraint community_channels_pkey primary key (id),
  constraint community_channels_community_id_kind_name_key unique (community_id, kind, name),
  constraint community_channels_community_id_fkey foreign key (community_id) references communities (id) on delete cascade,
  constraint community_channels_created_by_fkey foreign key (created_by) references profiles (id),
  constraint community_channels_kind_check check (
    kind = any (array['text'::text, 'voice'::text, 'admin'::text])
  )
) tablespace pg_default;
```

### `public.community_members`

```sql
create table public.community_members (
  id uuid not null default gen_random_uuid(),
  community_id uuid null,
  user_id uuid null,
  role text null default 'member'::text,
  joined_at timestamp with time zone null default now(),
  constraint community_members_pkey primary key (id),
  constraint community_members_community_id_user_id_key unique (community_id, user_id),
  constraint community_members_community_id_fkey foreign key (community_id) references communities (id) on delete cascade,
  constraint community_members_user_id_fkey foreign key (user_id) references profiles (id) on delete cascade
) tablespace pg_default;

create index if not exists members_user_idx
  on public.community_members using btree (user_id) tablespace pg_default;
```

### `public.community_memberships`

```sql
create table public.community_memberships (
  id uuid not null default gen_random_uuid(),
  community_id uuid not null,
  profile_id uuid not null,
  role text not null default 'member'::text,
  created_at timestamp with time zone not null default now(),
  constraint community_memberships_pkey primary key (id),
  constraint community_memberships_community_id_profile_id_key unique (community_id, profile_id),
  constraint community_memberships_community_id_fkey foreign key (community_id) references communities (id) on delete cascade,
  constraint community_memberships_profile_id_fkey foreign key (profile_id) references profiles (id) on delete cascade,
  constraint community_memberships_role_check check (
    role = any (array['owner'::text, 'member'::text, 'moderator'::text])
  )
) tablespace pg_default;
```

### `public.posts`

```sql
create table public.posts (
  id uuid not null default gen_random_uuid(),
  author_id uuid null,
  community_id uuid null,
  title text null,
  content text null,
  media_url text null,
  post_type text null default 'text'::text,
  created_at timestamp with time zone null default now(),
  constraint posts_pkey primary key (id),
  constraint posts_author_id_fkey foreign key (author_id) references profiles (id) on delete cascade,
  constraint posts_community_id_fkey foreign key (community_id) references communities (id) on delete set null
) tablespace pg_default;

create index if not exists posts_author_idx
  on public.posts using btree (author_id) tablespace pg_default;

create index if not exists posts_community_idx
  on public.posts using btree (community_id) tablespace pg_default;
```

### `public.comments`

```sql
create table public.comments (
  id uuid not null default gen_random_uuid(),
  post_id uuid null,
  author_id uuid null,
  parent_id uuid null,
  content text not null,
  created_at timestamp with time zone null default now(),
  constraint comments_pkey primary key (id),
  constraint comments_author_id_fkey foreign key (author_id) references profiles (id),
  constraint comments_parent_id_fkey foreign key (parent_id) references comments (id),
  constraint comments_post_id_fkey foreign key (post_id) references posts (id) on delete cascade
) tablespace pg_default;

create index if not exists comments_post_idx
  on public.comments using btree (post_id) tablespace pg_default;
```

### `public.events`

```sql
create table public.events (
  id uuid not null default gen_random_uuid(),
  community_id uuid null,
  organizer_id uuid null,
  title text not null,
  description text null,
  location text null,
  start_time timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  constraint events_pkey primary key (id),
  constraint events_community_id_fkey foreign key (community_id) references communities (id),
  constraint events_organizer_id_fkey foreign key (organizer_id) references profiles (id)
) tablespace pg_default;
```

### `public.friend_requests`

```sql
create table public.friend_requests (
  id uuid not null default gen_random_uuid(),
  sender_id uuid not null,
  receiver_id uuid not null,
  sender_username text not null,
  mutual_friends integer not null default 0,
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now(),
  constraint friend_requests_pkey primary key (id),
  constraint friend_requests_receiver_id_fkey foreign key (receiver_id) references auth.users (id) on delete cascade,
  constraint friend_requests_sender_id_fkey foreign key (sender_id) references auth.users (id) on delete cascade,
  constraint friend_requests_status_check check (
    status = any (array['pending'::text, 'accepted'::text, 'declined'::text])
  )
) tablespace pg_default;

create index if not exists friend_requests_receiver_idx
  on public.friend_requests using btree (receiver_id, status) tablespace pg_default;
```

### `public.friendships`

```sql
create table public.friendships (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  friend_user_id uuid null,
  friend_username text not null,
  status text not null default 'offline'::text,
  created_at timestamp with time zone not null default now(),
  constraint friendships_pkey primary key (id),
  constraint friendships_friend_user_id_fkey foreign key (friend_user_id) references auth.users (id) on delete set null,
  constraint friendships_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint friendships_status_check check (
    status = any (array['online'::text, 'away'::text, 'offline'::text])
  )
) tablespace pg_default;

create index if not exists friendships_user_idx
  on public.friendships using btree (user_id) tablespace pg_default;
```

### `public.reports`

```sql
create table public.reports (
  id uuid not null default gen_random_uuid(),
  reporter_id uuid null,
  post_id uuid null,
  comment_id uuid null,
  reason text null,
  created_at timestamp with time zone null default now(),
  constraint reports_pkey primary key (id),
  constraint reports_comment_id_fkey foreign key (comment_id) references comments (id),
  constraint reports_post_id_fkey foreign key (post_id) references posts (id),
  constraint reports_reporter_id_fkey foreign key (reporter_id) references profiles (id)
) tablespace pg_default;
```

## Suggested RLS Policies

Below are practical starter policies for the two tables you marked as needing policies.

### `public.community_channels` policies

```sql
alter table public.community_channels enable row level security;

create policy "community channels are viewable by allowed users"
on public.community_channels
for select
using (
  exists (
    select 1
    from public.communities c
    where c.id = community_channels.community_id
      and (
        c.privacy = 'public'
        or exists (
          select 1
          from public.community_memberships cm
          where cm.community_id = c.id
            and cm.profile_id = auth.uid()
        )
      )
  )
);

create policy "community members can create channels"
on public.community_channels
for insert
with check (
  exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = community_channels.community_id
      and cm.profile_id = auth.uid()
      and cm.role = any (array['owner'::text, 'moderator'::text])
  )
);

create policy "community moderators can update channels"
on public.community_channels
for update
using (
  exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = community_channels.community_id
      and cm.profile_id = auth.uid()
      and cm.role = any (array['owner'::text, 'moderator'::text])
  )
)
with check (
  exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = community_channels.community_id
      and cm.profile_id = auth.uid()
      and cm.role = any (array['owner'::text, 'moderator'::text])
  )
);

create policy "community moderators can delete channels"
on public.community_channels
for delete
using (
  exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = community_channels.community_id
      and cm.profile_id = auth.uid()
      and cm.role = any (array['owner'::text, 'moderator'::text])
  )
);
```

### `public.community_memberships` policies

```sql
alter table public.community_memberships enable row level security;

create policy "memberships are viewable by community members"
on public.community_memberships
for select
using (
  exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = community_memberships.community_id
      and cm.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.communities c
    where c.id = community_memberships.community_id
      and c.privacy = 'public'
  )
);

create policy "users can join public communities"
on public.community_memberships
for insert
with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.communities c
    where c.id = community_memberships.community_id
      and c.privacy = 'public'
  )
);

create policy "owners and moderators can add memberships"
on public.community_memberships
for insert
with check (
  exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = community_memberships.community_id
      and cm.profile_id = auth.uid()
      and cm.role = any (array['owner'::text, 'moderator'::text])
  )
);

create policy "users can leave communities"
on public.community_memberships
for delete
using (
  profile_id = auth.uid()
);

create policy "owners and moderators can remove memberships"
on public.community_memberships
for delete
using (
  exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = community_memberships.community_id
      and cm.profile_id = auth.uid()
      and cm.role = any (array['owner'::text, 'moderator'::text])
  )
);

create policy "owners can update member roles"
on public.community_memberships
for update
using (
  exists (
    select 1
    from public.community_memberships cm
    where cm.community_id = community_memberships.community_id
      and cm.profile_id = auth.uid()
      and cm.role = 'owner'
  )
)
with check (
  role = any (array['owner'::text, 'member'::text, 'moderator'::text])
);
```

## Optional Cleanup Recommendation

Since both `community_members` and `community_memberships` represent membership-like relationships, consider consolidating to one table unless both are intentionally serving different application concerns.
