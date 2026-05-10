create table if not exists public.stays (
  slug text primary key,
  name text not null,
  country text not null default '',
  place_name text not null default '',
  type text not null check (type in ('Hotel', 'Entire place', 'Boutique stay', 'Naturist camping')),
  rating numeric(3,2) not null default 0 check (rating >= 0 and rating <= 5),
  price integer not null check (price > 0),
  badge text not null default '',
  vibe text not null default '',
  amenities text[] not null default '{}',
  description text not null default '',
  website_url text not null,
  address text not null default '',
  map_latitude double precision,
  map_longitude double precision,
  check_in_window text not null default '',
  gallery text[] not null default '{}',
  policies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stays add column if not exists country text not null default '';
alter table public.stays add column if not exists place_name text not null default '';
alter table public.stays add column if not exists amenities text[] not null default '{}';
alter table public.stays add column if not exists map_latitude double precision;
alter table public.stays add column if not exists map_longitude double precision;
alter table public.stays add column if not exists gallery text[] not null default '{}';
alter table public.stays add column if not exists policies jsonb not null default '[]'::jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stays'
      and column_name = 'location'
  ) then
    execute 'alter table public.stays alter column location set default ''''';
  end if;
end $$;

do $$
begin
  alter table public.stays drop constraint if exists stays_type_check;
  alter table public.stays add constraint stays_type_check
    check (type in ('Hotel', 'Entire place', 'Boutique stay', 'Naturist camping'));
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stays'
      and column_name = 'perks'
  ) then
    execute 'update public.stays set amenities = perks where coalesce(array_length(amenities, 1), 0) = 0 and perks is not null';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stays'
      and column_name = 'location'
  ) then
    execute 'update public.stays set country = trim(split_part(location, ''·'', 1)), place_name = trim(split_part(location, ''·'', 2)) where country = '''' or place_name = ''''';
  end if;
end $$;

create index if not exists stays_name_idx on public.stays(name);
create index if not exists stays_country_place_idx on public.stays(country, place_name);