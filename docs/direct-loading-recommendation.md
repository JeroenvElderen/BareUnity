# Direct loading recommendation (clear plan)

You asked: **"What should we do? Can this be direct?"**

Short answer: **Yes, partly direct — but not 100% direct everywhere.**

## Why not make everything direct from the browser?

Some routes are safe/simple to read directly from Supabase in the client:

- profile basics
- settings basics
- user-owned lightweight tables

Other routes should stay behind server endpoints:

- homefeed aggregation
- gallery signed URLs
- anything requiring joins, ranking, denormalization, or service-role behavior

If we force *all* of that direct in the browser, we usually get:

1. More client round-trips (slower)
2. More duplicated query logic across pages
3. Harder security and consistency controls

## Recommended architecture

Use a **hybrid model**:

1. **Direct client reads for simple per-user records**
   - Keep profile/settings direct via Supabase client.
   - Keep queries short and table-scoped.

2. **Server endpoints for complex/computed payloads**
   - Homefeed, gallery snapshot, and map aggregations stay API-driven.
   - Keep single endpoint per page payload shape.

3. **Prefetch only where it materially helps first paint**
   - Keep short-lived in-memory handoff for Home/Gallery/Map.
   - Avoid broad long-lived caching if you prefer “fresh-first”.

4. **Make navigation feel instant without stale cache**
   - Prefetch route + data during auth/bootstrap and on likely transitions.
   - Render skeleton immediately, then swap with warm payload.

## Concrete next steps (priority order)

1. Keep current direct profile/settings reads.
2. Keep API payload routes for homefeed/gallery/map.
3. Add a tiny telemetry panel/logging for:
   - time to first non-empty content per route
   - warmup hit/miss
   - number of requests on first navigation
4. Only remove more snapshot-style APIs if telemetry proves no regression.

## Decision rule

Before changing a route to “direct”, ask:

- Is it a single-table/simple query with RLS-safe data?
- Can it be loaded in 1–2 calls?
- Does moving it client-side reduce total latency?

If all **yes** → make it direct.  
If any **no** → keep/introduce a server payload endpoint.
