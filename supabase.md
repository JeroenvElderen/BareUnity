# Supabase Schema (Source of Truth)

This file is the **current schema reference** for the `public` schema in this project and should be updated whenever a migration changes tables/columns/indexes.

## How to keep this file up to date

1. Add/modify SQL migration files under `supabase/`.
2. Apply migration in Supabase SQL editor.
3. Update this document in the same PR:
   - update the table inventory,
   - include new/changed columns and constraints,
   - list new indexes,
   - record any new RLS policy recommendations.

---

## Current Table Inventory (`public`)

### Core profile/content
- `profiles`
- `posts`
- `comments`
- `events`
- `reports`

### Social
- `friend_requests`
- `friendships`

### Community foundation
- `communities`
- `community_channels`
- `community_members`
- `community_memberships`

### Community feature expansion
- `community_invite_links`
- `community_join_requests`
- `community_announcements`
- `community_roles`
- `community_member_roles`
- `community_pinned_posts`
- `community_categories`
- `community_templates`
- `community_analytics_daily`
- `community_activity_feed`
- `community_reputation`
- `community_leaderboards`
- `community_wikis`
- `community_file_libraries`
- `community_polls`
- `community_milestones`
- `community_highlight_posts`
- `community_moderator_chats`

---

## Canonical DDL

> `gen_random_uuid()` assumes `pgcrypto` is enabled.

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
  category text null,
  tags text[] not null default '{}',
  rules jsonb not null default '[]'::jsonb,
  announcement text null,
  welcome_message text null,
  guidelines_url text null,
  template_key text null,
  featured boolean not null default false,
  verified boolean not null default false,
  join_mode text not null default 'open',
  reputation_enabled boolean not null default true,
  onboarding_enabled boolean not null default true,
  constraint communities_pkey primary key (id),
  constraint communities_name_key unique (name),
  constraint communities_slug_key unique (slug),
  constraint communities_created_by_fkey foreign key (created_by) references profiles (id),
  constraint communities_privacy_check check (
    privacy = any (array['public'::text, 'restricted'::text, 'private'::text])
  ),
  constraint communities_join_mode_check check (
    join_mode in ('open', 'request', 'invite_only')
  )
) tablespace pg_default;

create index if not exists communities_featured_idx on public.communities (featured);
create index if not exists communities_verified_idx on public.communities (verified);
create index if not exists communities_category_idx on public.communities (category);
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

### `public.community_invite_links`

```sql
create table if not exists public.community_invite_links (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  token text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
```

### `public.community_join_requests`

```sql
create table if not exists public.community_join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (community_id, profile_id),
  constraint community_join_requests_status_check check (status in ('pending', 'approved', 'declined'))
);

create index if not exists community_join_requests_status_idx on public.community_join_requests (community_id, status);
```

### `public.community_announcements`

```sql
create table if not exists public.community_announcements (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  title text not null,
  body text,
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
```

### `public.community_roles`

```sql
create table if not exists public.community_roles (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  scope text not null,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (community_id, name),
  constraint community_roles_scope_check check (scope in ('admin', 'moderator', 'member'))
);
```

### `public.community_member_roles`

```sql
create table if not exists public.community_member_roles (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.community_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (community_id, profile_id, role_id)
);
```

### `public.community_pinned_posts`

```sql
create table if not exists public.community_pinned_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  unique (community_id, post_id)
);
```

### `public.community_categories`

```sql
create table if not exists public.community_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
```

### `public.community_templates`

```sql
create table if not exists public.community_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  default_rules jsonb not null default '[]'::jsonb,
  default_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
```

### `public.community_analytics_daily`

```sql
create table if not exists public.community_analytics_daily (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  day date not null,
  active_members integer not null default 0,
  posts_count integer not null default 0,
  comments_count integer not null default 0,
  join_requests_count integer not null default 0,
  unique (community_id, day)
);
```

### `public.community_activity_feed`

```sql
create table if not exists public.community_activity_feed (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists community_activity_feed_community_idx on public.community_activity_feed (community_id, created_at desc);
```

### `public.community_reputation`

```sql
create table if not exists public.community_reputation (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null default 0,
  last_calculated_at timestamptz,
  unique (community_id, profile_id)
);

create index if not exists community_reputation_score_idx on public.community_reputation (community_id, score desc);
```

### `public.community_leaderboards`

```sql
create table if not exists public.community_leaderboards (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  period text not null,
  ranking jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now()
);
```

### `public.community_wikis`

```sql
create table if not exists public.community_wikis (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  slug text not null,
  title text not null,
  content text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (community_id, slug)
);
```

### `public.community_file_libraries`

```sql
create table if not exists public.community_file_libraries (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  uploader_id uuid references public.profiles(id) on delete set null,
  name text not null,
  file_url text not null,
  mime_type text,
  created_at timestamptz not null default now()
);
```

### `public.community_polls`

```sql
create table if not exists public.community_polls (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  question text not null,
  options jsonb not null,
  closes_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
```

### `public.community_milestones`

```sql
create table if not exists public.community_milestones (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  title text not null,
  description text,
  reached_at timestamptz,
  created_at timestamptz not null default now()
);
```

### `public.community_highlight_posts`

```sql
create table if not exists public.community_highlight_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (community_id, post_id)
);
```

### `public.community_moderator_chats`

```sql
create table if not exists public.community_moderator_chats (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);
```

---

## Suggested RLS starter policies

These are starter examples and should be adapted to your final access model.

### `public.community_channels`

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
```

### `public.community_memberships`

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
```

---

## Migration reference

- Community feature expansion migration: `supabase/community_feature_updates.sql`