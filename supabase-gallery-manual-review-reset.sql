-- Reset every gallery item back to pending manual Discord review.
-- Run this in the Supabase SQL editor after deploying the Discord bot/app.
-- First replace YOUR-PROJECT below, or leave it blank and let the bot sign paths
-- from the media bucket when it reads gallery_media directly.
-- select set_config('app.settings.supabase_url', 'https://YOUR-PROJECT.supabase.co', false);
--
-- What it does:
-- 1. Marks every public.gallery_media row as pending again.
-- 2. Clears previous Discord review thread/message/reviewer tracking.
-- 3. Removes old unprocessed gallery review queue events so dedupe keys can be rebuilt.
-- 4. Queues one fresh gallery_image_review_requested event for every gallery item.
--
-- This does not delete images from Supabase Storage. It only resets moderation
-- state so Discord can present Nude / General / Reject buttons again.

begin;

update public.gallery_media
set gallery_type = 'pending',
    moderation_status = 'pending',
    moderation_reason = 'Reset for Discord manual gallery filtering.',
    reviewed_at = null,
    discord_review_channel_id = null,
    discord_review_thread_id = null,
    discord_review_message_id = null,
    discord_review_status = 'pending',
    discord_reviewer_id = null,
    updated_at = now();

delete from public.discord_crosspost_events
where event_type = 'gallery_image_review_requested';

insert into public.discord_crosspost_events (
  website_post_id,
  gallery_image_path,
  event_type,
  payload,
  dedupe_key
)
select
  null,
  gm.image_path,
  'gallery_image_review_requested',
  jsonb_build_object(
    'imagePath', gm.image_path,
    'ownerId', gm.owner_id,
    'title', gm.title,
    'source', 'manual_reset_all_pending',
    'reviewChannelId', '1517153973835010139',
    'galleryButtons', jsonb_build_array('nude-gallery', 'general-gallery', 'reject-gallery-image'),
    'publicUrl', case
      when gm.image_path ~* '^https?://' then gm.image_path
      else case
        when nullif(current_setting('app.settings.supabase_url', true), '') is null then null
        else concat(
          rtrim(current_setting('app.settings.supabase_url', true), '/'),
          '/storage/v1/object/public/media/',
          ltrim(gm.image_path, '/')
        )
      end
    end,
    'bucketId', 'media',
    'discordReview', jsonb_build_object(
      'channelId', '1517153973835010139',
      'mode', 'one_image_per_forum_thread',
      'deleteThreadAfterDecision', true
    )
  ),
  'gallery-review:' || gm.image_path
from public.gallery_media gm
where gm.image_path is not null
on conflict (dedupe_key) do update set
  processed_at = null,
  attempts = 0,
  error = null,
  payload = excluded.payload,
  created_at = now();

commit;

-- If you skipped set_config above, publicUrl is null. That is still OK for
-- platform_grove_admin.py because it signs gallery_media.image_path from the
-- media bucket when posting the review embed.
