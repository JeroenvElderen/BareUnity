-- TeamNaturist Discord registrations
-- Apply this file in the Supabase SQL editor for the TeamNaturist Discord flow.
--
-- Discord server/role membership is checked by the app with DISCORD_BOT_TOKEN.
-- This legacy redemption table/function set is no longer required for Discord invite signup;
-- the app now trusts the live Discord guild role check and Supabase Auth identity.

create table if not exists public.teamnaturist_discord_redemptions (
  discord_user_id text primary key check (length(trim(discord_user_id)) > 0),
  redeemed_by uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

alter table public.teamnaturist_discord_redemptions enable row level security;

revoke all on public.teamnaturist_discord_redemptions from anon, authenticated;
grant select, insert, update, delete on public.teamnaturist_discord_redemptions to service_role;

drop function if exists public.validate_teamnaturist_invite(text, text);
drop function if exists public.redeem_teamnaturist_invite(text, text);
drop function if exists public.redeem_teamnaturist_invite(text, text, uuid);
drop function if exists public.release_teamnaturist_invite_redemption(text, text);
drop function if exists public.release_teamnaturist_invite_redemption(text, text, uuid);
drop function if exists public.redeem_teamnaturist_discord_member(text, uuid);
drop function if exists public.release_teamnaturist_discord_redemption(text, uuid);

create or replace function public.redeem_teamnaturist_discord_member(
  p_discord_user_id text,
  p_redeemed_by uuid
)
returns table (
  discord_user_id text,
  redeemed_by uuid,
  redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.teamnaturist_discord_redemptions (
    discord_user_id,
    redeemed_by,
    redeemed_at
  )
  values (
    trim(p_discord_user_id),
    p_redeemed_by,
    now()
  )
  on conflict (discord_user_id) do nothing
  returning
    teamnaturist_discord_redemptions.discord_user_id,
    teamnaturist_discord_redemptions.redeemed_by,
    teamnaturist_discord_redemptions.redeemed_at;
end;
$$;

create or replace function public.release_teamnaturist_discord_redemption(
  p_discord_user_id text,
  p_redeemed_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.teamnaturist_discord_redemptions redemption
  where redemption.discord_user_id = trim(p_discord_user_id)
    and redemption.redeemed_by = p_redeemed_by;
end;
$$;

grant execute on function public.redeem_teamnaturist_discord_member(text, uuid) to service_role;
grant execute on function public.release_teamnaturist_discord_redemption(text, uuid) to service_role;
