-- Discord forum review workflow for gallery images.
-- Run this after supabase-gallery-moderation.sql and supabase-discord-crosspost-live-sync.sql.

alter table public.gallery_media
  add column if not exists discord_review_channel_id text,
  add column if not exists discord_review_thread_id text,
  add column if not exists discord_review_message_id text,
  add column if not exists discord_review_status text not null default 'pending',
  add column if not exists discord_reviewer_id text;

alter table public.gallery_media
  drop constraint if exists gallery_media_discord_review_status_check;
alter table public.gallery_media
  add constraint gallery_media_discord_review_status_check
  check (discord_review_status in ('pending', 'posted', 'done', 'failed')) not valid;

create index if not exists gallery_media_discord_review_pending_idx
  on public.gallery_media (discord_review_status, updated_at asc)
  where moderation_status = 'pending';
create unique index if not exists gallery_media_discord_review_thread_id_key
  on public.gallery_media (discord_review_thread_id)
  where discord_review_thread_id is not null;

alter table public.gallery_moderation_audit
  add column if not exists discord_user_id text,
  add column if not exists discord_thread_id text;

-- Keep this migration runnable even if the Discord crosspost live-sync migration
-- was skipped. The live-sync migration also creates this table; this copy keeps
-- the review queue dependency idempotent for Supabase SQL editor repair runs.
create table if not exists public.discord_crosspost_events (
  id uuid primary key default gen_random_uuid(),
  website_post_id uuid references public.posts(id) on delete cascade,
  gallery_image_path text,
  discord_thread_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.discord_crosspost_events
  add column if not exists discord_channel_id text;

create index if not exists discord_crosspost_events_gallery_review_idx
  on public.discord_crosspost_events (gallery_image_path, event_type, created_at desc)
  where gallery_image_path is not null;

-- Backfill older uploads: queue every existing gallery image that is still pending review
-- and has not already completed the Discord review flow. Already-approved or rejected
-- gallery rows are left alone; set moderation_status = 'pending' first if you want to
-- re-review a previously approved older image in Discord.
insert into public.discord_crosspost_events (
  gallery_image_path,
  event_type,
  payload,
  dedupe_key
)
select
  gm.image_path,
  'gallery_image_review_requested',
  jsonb_build_object(
    'imagePath', gm.image_path,
    'ownerId', gm.owner_id,
    'title', gm.title,
    'source', 'repair_existing_pending',
    'reviewChannelId', '1517153973835010139',
    'galleryButtons', jsonb_build_array('nude-gallery', 'general-gallery', 'reject-gallery-image'),
    'bucketId', 'user-media',
    'discordReview', jsonb_build_object(
      'channelId', '1517153973835010139',
      'mode', 'one_image_per_forum_thread',
      'deleteThreadAfterDecision', true
    )
  ),
  'gallery-review:' || gm.image_path
from public.gallery_media gm
where gm.moderation_status = 'pending'
  and coalesce(gm.discord_review_status, 'pending') in ('pending', 'failed')
on conflict (dedupe_key) do nothing;
