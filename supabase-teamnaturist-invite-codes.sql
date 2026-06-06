-- TeamNaturist Discord invite codes
-- Apply this file in the Supabase SQL editor for the TeamNaturist invite flow.
--
-- Invite codes are unlimited: there is no pending/used status and no usage
-- counter. Registration succeeds when both are true:
--   1) public.invite_codes contains the submitted invite code.
--   2) public.teamnaturist contains the submitted Discord username.

create table if not exists public.invite_codes (
  code_text text primary key check (length(trim(code_text)) > 0),
  partner_name text,
  notes text
);

-- If you previously installed the older limited-use invite schema, remove the
-- one-use/seat-limit columns so codes are reusable forever.
alter table public.invite_codes
  drop column if exists status,
  drop column if exists uses_count,
  drop column if exists max_uses,
  add column if not exists partner_name text,
  add column if not exists notes text;

-- TeamNaturist Discord allowlist.
-- Keep this table intentionally simple: one row per Discord username.
-- Usernames are stored exactly as provided, including any symbols/characters.
create table if not exists public.teamnaturist (
  username text primary key check (length(trim(username)) > 0)
);

alter table public.invite_codes enable row level security;
alter table public.teamnaturist enable row level security;

revoke all on public.invite_codes from anon, authenticated;
revoke all on public.teamnaturist from anon, authenticated;
grant select, insert, update, delete on public.invite_codes to service_role;
grant select, insert, update, delete on public.teamnaturist to service_role;

drop function if exists public.redeem_invite_code(text);
drop function if exists public.redeem_invite_code(text, text);
drop function if exists public.release_invite_code_redemption(text);

create or replace function public.validate_teamnaturist_invite(
  p_code_text text,
  p_discord_username text
)
returns table (
  code_text text,
  partner_name text
)
language sql
security definer
set search_path = public
as $$
  select
    invite_codes.code_text,
    invite_codes.partner_name
  from public.invite_codes
  where invite_codes.code_text = trim(p_code_text)
    and exists (
      select 1
      from public.teamnaturist member
      where member.username = trim(p_discord_username)
    );
$$;

grant execute on function public.validate_teamnaturist_invite(text, text) to service_role;

-- Create unlimited invite codes by inserting your exact custom text.
insert into public.invite_codes (code_text, partner_name)
values
  ('BARE-PARTNER-2026', 'TeamNaturist Discord')
on conflict (code_text) do update
set partner_name = excluded.partner_name;

-- Optional admin examples:
-- Add TeamNaturist Discord usernames that are allowed to redeem a valid invite code:
-- insert into public.teamnaturist (username)
-- values
--   ('teamnaturist_member'),
--   ('member.with.symbols_123'),
--   ('any symbols !@#$%^&*()[]{}')
-- on conflict (username) do nothing;
--
-- Create another reusable TeamNaturist code:
-- insert into public.invite_codes (code_text, partner_name)
-- values ('TEAMNATURIST-2026', 'TeamNaturist Discord')
-- on conflict (code_text) do update set partner_name = excluded.partner_name;
--
-- Remove/disable a code manually:
-- delete from public.invite_codes where code_text = 'BARE-PARTNER-2026';
