-- BareUnity: multi-image homefeed posts
-- Run this in Supabase SQL editor before deploying multi-media homefeed code.

alter table public.posts
  add column if not exists media_urls text[] not null default '{}';

update public.posts
set media_urls = array[media_url]
where media_url is not null
  and btrim(media_url) <> ''
  and coalesce(array_length(media_urls, 1), 0) = 0;
