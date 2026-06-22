-- Discord member-card forum sync support.
-- Apply in Supabase so profile edits made from any client enqueue realtime Discord updates.

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

create or replace function public.enqueue_discord_member_card_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb := '{}'::jsonb;
  v_discord_user_id text;
  v_registered_from text;
begin
  select coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_metadata
  from auth.users u
  where u.id = new.id;

  select pdi.discord_user_id
    into v_discord_user_id
  from public.profile_discord_identities pdi
  where pdi.profile_id = new.id
  limit 1;

  v_registered_from := coalesce(
    nullif(v_metadata->>'discord_verification_source', ''),
    nullif(v_metadata->>'registration_source', ''),
    nullif(v_metadata->>'account_access', '')
  );

  if tg_op = 'INSERT'
     or new.username is distinct from old.username
     or new.display_name is distinct from old.display_name
     or new.bio is distinct from old.bio
     or new.avatar_url is distinct from old.avatar_url then
    insert into public.discord_crosspost_events (
      website_post_id,
      event_type,
      payload,
      dedupe_key
    ) values (
      null,
      'member_card_upserted',
      jsonb_build_object(
        'profileId', new.id,
        'username', new.username,
        'displayName', new.display_name,
        'bio', new.bio,
        'avatarUrl', new.avatar_url,
        'avatarPath', new.avatar_url,
        'location', new.location,
        'registeredFrom', v_registered_from,
        'discordUserId', coalesce(v_discord_user_id, nullif(v_metadata->>'discord_user_id', '')),
        'memberCardsForumId', '1517155438615859390',
        'reason', lower(tg_op),
        'renderMode', 'discord_embed',
        'imageMode', 'refresh_from_member_card_snapshot_if_avatar_is_not_absolute',
        'updatedAt', now()
      ),
      'member-card:' || new.id || ':' || extract(epoch from clock_timestamp())::text
    ) on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_discord_member_card_event on public.profiles;
create trigger profiles_discord_member_card_event
after insert or update of username, display_name, bio, avatar_url on public.profiles
for each row execute function public.enqueue_discord_member_card_event();
