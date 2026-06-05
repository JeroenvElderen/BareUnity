-- Simple registration invite codes
-- Apply this file in the Supabase SQL editor to use plain, manually-created
-- invite text instead of hashed codes, max-use counts, expiry dates, or helper RPCs.
--
-- The app checks public.invite_codes.code_text and changes status from
-- 'pending' to 'used' after a successful invite registration.

create table if not exists public.invite_codes (
  code_text text primary key check (length(trim(code_text)) > 0),
  status text not null default 'pending' check (status in ('pending', 'used'))
);

alter table public.invite_codes enable row level security;

revoke all on public.invite_codes from anon, authenticated;
grant select, insert, update on public.invite_codes to service_role;

-- Create invite codes by inserting your exact custom text.
-- Give the same code_text value to the invited person.
insert into public.invite_codes (code_text, status)
values
  ('BARE-PARTNER-2026', 'pending')
on conflict (code_text) do nothing;

-- Optional admin examples:
-- Mark a code as used manually:
-- update public.invite_codes set status = 'used' where code_text = 'BARE-PARTNER-2026';
--
-- Re-open a code:
-- update public.invite_codes set status = 'pending' where code_text = 'BARE-PARTNER-2026';
