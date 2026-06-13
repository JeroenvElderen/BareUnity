-- Three-tier gallery classification and moderation metadata.

create table if not exists public.gallery_media (
  image_path text primary key,
  owner_id uuid references public.profiles(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gallery_media add column if not exists gallery_type text default 'pending';
alter table public.gallery_media add column if not exists moderation_status text default 'pending';
alter table public.gallery_media add column if not exists moderation_confidence numeric;
alter table public.gallery_media add column if not exists moderation_reason text;
alter table public.gallery_media add column if not exists contains_person boolean default false;
alter table public.gallery_media add column if not exists contains_adult_nudity boolean default false;
alter table public.gallery_media add column if not exists contains_landscape boolean default false;
alter table public.gallery_media add column if not exists contains_animal boolean default false;
alter table public.gallery_media add column if not exists contains_vehicle boolean default false;
alter table public.gallery_media add column if not exists contains_building boolean default false;
alter table public.gallery_media add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.gallery_media add column if not exists reviewed_at timestamptz;
alter table public.gallery_media add column if not exists report_count integer not null default 0;

alter table public.gallery_media
  add constraint gallery_media_gallery_type_check check (gallery_type in ('nude', 'general', 'pending')) not valid;
alter table public.gallery_media
  add constraint gallery_media_moderation_status_check check (moderation_status in ('approved', 'pending', 'rejected')) not valid;

create index if not exists gallery_media_public_lookup_idx
  on public.gallery_media (gallery_type, moderation_status, created_at desc);
create index if not exists gallery_media_pending_lookup_idx
  on public.gallery_media (moderation_status, updated_at desc);
create index if not exists gallery_media_report_count_idx
  on public.gallery_media (report_count desc);

create table if not exists public.gallery_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  image_path text not null references public.gallery_media(image_path) on delete cascade,
  moderator_id uuid references public.profiles(id) on delete set null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists gallery_moderation_audit_image_path_idx
  on public.gallery_moderation_audit (image_path, created_at desc);

update public.gallery_media
set gallery_type = 'pending', moderation_status = 'pending'
where gallery_type is null or moderation_status is null;
