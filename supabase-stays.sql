create table if not exists public.stays (
  slug text primary key,
  name text not null,
  location text not null,
  type text not null check (type in ('Hotel', 'Entire place', 'Boutique stay')),
  rating numeric(3,2) not null default 0,
  reviews integer not null default 0,
  price integer not null,
  nights integer not null default 1,
  badge text not null default '',
  vibe text not null default '',
  amenities text[] not null default '{}',
  description text not null default '',
  website_url text not null,
  address text not null default '',
  check_in_window text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stays add column if not exists amenities text[] not null default '{}';
update public.stays set amenities = perks where coalesce(array_length(amenities, 1), 0) = 0 and perks is not null;

create index if not exists stays_name_idx on public.stays(name);

insert into public.stays (slug, name, location, type, rating, reviews, price, nights, badge, vibe, amenities, description, website_url, address, check_in_window)
values
('harbor-light-suites', 'Harbor Light Suites', 'San Diego · Waterfront', 'Hotel', 9.1, 842, 248, 4, 'Best value', 'Resort energy · Morning yoga · Sunset terrace', '{"Dogs allowed","Private bathroom","Toiletries","Breakfast included","Free cancellation","Ocean-view suites"}', 'Modern suites steps from the marina with flexible cancellation and an easy walk to dining, tours, and coastal bike paths.', 'https://www.example.com/harbor-light-suites', '145 Harbor View Dr, San Diego, CA', 'Check-in 3:00 PM · Check-out 11:00 AM'),
('sage-loft-by-the-park', 'Sage Loft by the Park', 'Austin · Zilker', 'Entire place', 4.88, 167, 192, 4, 'Guest favorite', 'Quiet block · Walkable coffee shops · Remote-work setup', '{"Dogs allowed","Full bathroom","Kitchen","Self check-in","Workspace","Superhost"}', 'Bright private loft with neighborhood charm, strong Wi-Fi, and a calm setup ideal for blended work + weekend travel.', 'https://www.example.com/sage-loft-by-the-park', '212 Barton Springs Rd, Austin, TX', 'Check-in 4:00 PM · Check-out 10:00 AM'),
('palm-courtyard-retreat', 'Palm Courtyard Retreat', 'Miami · South Beach', 'Boutique stay', 8.7, 513, 276, 4, 'Free airport transfer', 'Design-forward rooms · Spa package · Rooftop lounge', '{"Pool","Spa bathroom","Toiletries","Late checkout","Pay at property"}', 'Stylish boutique stay with spa-ready amenities, rooftop social spaces, and optional transfer perks for smooth arrivals.', 'https://www.example.com/palm-courtyard-retreat', '55 Collins Ave, Miami Beach, FL', 'Check-in 3:00 PM · Check-out 11:00 AM')
on conflict (slug) do update
set name = excluded.name,
    location = excluded.location,
    type = excluded.type,
    rating = excluded.rating,
    reviews = excluded.reviews,
    price = excluded.price,
    nights = excluded.nights,
    badge = excluded.badge,
    vibe = excluded.vibe,
    amenities = excluded.amenities,
    description = excluded.description,
    website_url = excluded.website_url,
    address = excluded.address,
    check_in_window = excluded.check_in_window,
    updated_at = now();
