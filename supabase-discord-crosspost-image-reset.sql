-- Reset pending BareUnity -> Discord post routing events after deploying the
-- absolute media URL fix. Run this in Supabase SQL editor if an older website
-- post reached the Discord case-management channel without an image preview.
--
-- Replace the UUID below with the affected public.posts.id, then run both
-- statements. The app/bot will recreate the Discord review event using public
-- Supabase Storage URLs that Discord can embed.

-- 1) Clear the old sync row for the affected website post.
delete from public.discord_reddit_crosspost_sync
where website_post_id = '00000000-0000-0000-0000-000000000000'::uuid;

-- 2) Clear the old queued/failed event for the affected website post.
delete from public.discord_crosspost_events
where website_post_id = '00000000-0000-0000-0000-000000000000'::uuid
  and event_type = 'website_post_created';

-- 3) Re-save or recreate the post in BareUnity, or call the app code path that
-- runs ensureWebsitePostQueuedForDiscord(postId), so a fresh Discord event is
-- inserted with absolute mediaUrl/mediaUrls payload values.
