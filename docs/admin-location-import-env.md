# Admin location import environment setup

The admin website importer can crawl a site, extract location details, enrich the stay/place with Google details, cross-check the coordinate with Mapbox, and then let an admin approve the final marker.

## Required Supabase variables

Set these for local development in `.env.local` and in your production host, such as Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
DATABASE_URL="postgresql://...pooled...?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://...direct..."
PLATFORM_ADMIN_EMAILS="you@example.com"
```

How they are used:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` let the browser sign in and send the admin bearer token to API routes.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. It lets API routes use the Supabase admin fallback for reads/writes when Prisma is unavailable.
- `DATABASE_URL` is used by Prisma at runtime. Use the Supabase pooled URL for hosted runtime environments.
- `DIRECT_URL` is used by Prisma for direct database access during pull/generate/migrations.
- `PLATFORM_ADMIN_EMAILS` must include your signed-in email in production, otherwise admin API routes return `Admin access is not configured.` or `Forbidden.`

## Recommended full-details setup

Use Google for rich admin-only stay/place details and Mapbox for a coordinate cross-check:

```bash
GOOGLE_MAPS_API_KEY="your-google-server-api-key"
MAPBOX_ACCESS_TOKEN="your-mapbox-server-token"
```

Enable these Google APIs on the key:

- Places API, for stay/business/place details.
- Geocoding API, for address-to-coordinate fallback.

`GOOGLE_PLACES_API_KEY` is also accepted as an alias, but `GOOGLE_MAPS_API_KEY` is the recommended single variable.

Keep both keys server-only. Do not prefix them with `NEXT_PUBLIC_`.

## Why Google is acceptable for your expected usage

If only admins import stays and you cap usage around 5 stays per day, that is roughly 150 imports per month. The app makes Google calls only from the protected admin import route and saves the returned details into your database, so normal public page views do not spend Google quota.

Recommended cost guardrails:

- Keep Google and Mapbox keys server-only.
- Do not call Google from public frontend pages.
- Save accepted details/coordinates to Supabase and reuse saved data.
- Keep imports admin-only.
- Add Google Cloud Billing budget alerts, for example $1, $5, and $10.

## What happens if Google is missing?

The importer still crawls and extracts website details. It can use Mapbox as the primary coordinate source and OpenStreetMap/Nominatim as a final fallback, but rich Google details such as phone, rating, Google Maps URL, business status, and opening hours will be missing.

## What happens if Mapbox is missing?

The importer can still use Google for rich details and coordinates, but it cannot compute an independent Mapbox coordinate cross-check distance. The admin UI will show notes so you can manually review the map preview before publishing.
