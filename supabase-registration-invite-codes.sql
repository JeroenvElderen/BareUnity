-- Trusted partner registration invite codes
-- Apply this in Supabase SQL editor before enabling the invite-code path.
-- Codes are stored as SHA-256 hashes of UPPER(TRIM(code)); do not store raw invite codes.

create extension if not exists pgcrypto;

create table if not exists public.registration_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  label text not null,
  partner_name text,
  max_uses integer not null default 1 check (max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_invite_codes_uses_not_over_max check (uses_count <= max_uses)
);

create index if not exists registration_invite_codes_active_idx
  on public.registration_invite_codes (code_hash)
  where revoked_at is null;

create table if not exists public.registration_invite_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_code_id uuid not null references public.registration_invite_codes(id) on delete cascade,
  redeemed_by uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  code_hash text not null,
  unique (invite_code_id, redeemed_by)
);

create index if not exists registration_invite_code_redemptions_user_idx
  on public.registration_invite_code_redemptions (redeemed_by, redeemed_at desc);

create or replace function public.set_registration_invite_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists registration_invite_codes_updated_at on public.registration_invite_codes;
create trigger registration_invite_codes_updated_at
before update on public.registration_invite_codes
for each row execute function public.set_registration_invite_codes_updated_at();

create or replace function public.redeem_registration_invite_code(
  p_code_hash text,
  p_redeemed_by uuid
)
returns table(ok boolean, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.registration_invite_codes%rowtype;
begin
  if p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then
    return query select false, 'Invalid invite code.';
    return;
  end if;

  if p_redeemed_by is null then
    return query select false, 'Missing invite redeemer.';
    return;
  end if;

  update public.registration_invite_codes
     set uses_count = uses_count + 1
   where code_hash = p_code_hash
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and uses_count < max_uses
   returning * into v_invite;

  if not found then
    return query select false, 'Invite code is invalid, expired, revoked, or already fully used.';
    return;
  end if;

  insert into public.registration_invite_code_redemptions (
    invite_code_id,
    redeemed_by,
    code_hash
  ) values (
    v_invite.id,
    p_redeemed_by,
    p_code_hash
  );

  return query select true, null::text;
exception
  when unique_violation then
    return query select false, 'This invite code has already been redeemed for this account.';
end;
$$;

alter table public.registration_invite_codes enable row level security;
alter table public.registration_invite_code_redemptions enable row level security;

revoke all on public.registration_invite_codes from anon, authenticated;
revoke all on public.registration_invite_code_redemptions from anon, authenticated;
revoke execute on function public.redeem_registration_invite_code(text, uuid) from anon, authenticated;

grant select, insert, update on public.registration_invite_codes to service_role;
grant select, insert on public.registration_invite_code_redemptions to service_role;
grant execute on function public.redeem_registration_invite_code(text, uuid) to service_role;

-- Example: create a single-use invite code. Send only the raw code to the partner.
-- insert into public.registration_invite_codes (code_hash, label, partner_name, max_uses, expires_at)
-- values (
--   encode(digest(upper(trim('BARE-PARTNER-2026')), 'sha256'), 'hex'),
--   'Partner 2026 pilot',
--   'Trusted verification partner name',
--   1,
--   now() + interval '30 days'
-- );
--
-- Example: revoke a code without deleting audit history.
-- update public.registration_invite_codes
--    set revoked_at = now()
--  where code_hash = encode(digest(upper(trim('BARE-PARTNER-2026')), 'sha256'), 'hex');
