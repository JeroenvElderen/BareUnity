# Instant-load playbook (BareUnity)

This project can feel **instant** by combining:

1. **Server-rendered first paint** (show layout + initial data before JS hydrates).
2. **Aggressive cache reuse** (client + server + CDN) with stale-while-revalidate behavior.
3. **Prefetching next likely routes and data** based on user intent.
4. **Reducing Supabase round-trips** (batching, RPC/materialized views, and denormalized reads).

## Current baseline in this repo

- Home feed already does localStorage cache-first rendering and background refresh. (`buildUserScopedCacheKey`, `hasFreshCachedValue`, `readCachedValue`, `writeCachedValue`).
- Profile page already uses `loadCachedThenRefresh` and parallel Supabase calls.
- There is a server cache table path (`user_cache_entries`) and a warm endpoint at `POST /api/cache/warm` for active users.

These patterns are good, but they are not yet applied consistently across all pages/routes/components.

## Phase 1 (quick wins, low risk)

### 1) Render shells on the server for every top route

- Add route-level `loading.tsx` for `profile`, `gallery`, `settings`, `bookings/*`, and `explore`.
- Keep sidebars/layout visible immediately; stream content sections as they resolve.
- Prefer Server Components for read-only sections so data fetching starts on the server.

### 2) Normalize cache strategy by data type

Use a simple policy matrix:

- **Critical identity/session:** no stale cache > 30s.
- **Feed/profile lists:** stale cache allowed 3–15 min, background refresh.
- **Reference data (categories, map metadata):** cache 30–120 min.

Implement this once in a shared cache-policy utility and reuse everywhere.

### 3) Prefetch links and API data on hover/viewport

- For high-traffic transitions (home -> profile/settings/explore), trigger prefetch when links enter viewport or on hover.
- Preload likely data payloads (profile summary, map spots, settings metadata).
- Keep prefetched payloads in TanStack Query cache or your existing localStorage key strategy.

### 4) Warm server cache proactively

- Schedule `POST /api/cache/warm` every few minutes for recently active users.
- Expand warm scope from `homefeed` to include profile summary and settings snapshot.
- Add metrics: warm hit rate, warm duration, and fallback-to-DB count.

## Phase 2 (bigger impact)

### 5) Move multi-query Supabase reads into RPC/view-backed endpoints

Several pages still do multiple queries per view. For "instant" UX, move those to single round-trip reads:

- Build SQL `rpc_get_profile_snapshot(user_id)` returning:
  - profile row
  - latest posts
  - counts (posts/friends/comments)
  - settings/interests
- Build `rpc_get_homefeed_snapshot(user_id)` that returns your existing payload shape.

This avoids repeated network latency and simplifies cache invalidation boundaries.

### 6) Add write-through invalidation hooks

After writes (post create/edit/delete, like, comments):

- Invalidate relevant server cache keys (`homefeed`, `profile`).
- Refresh client cache entries with optimistic updates.
- Fall back to background reconciliation fetch.

### 7) Reduce JS on first load

- Lazy-load heavy, below-the-fold interactive components.
- Split map/explore and rich editor logic into dynamic chunks.
- Audit bundle with `next build` analyzer and set page-level budgets.

## Phase 3 (near-instant feel)

### 8) Edge-cache anonymous/public payloads

For any public/anonymous payloads:

- Use edge-friendly cache headers (`s-maxage` + `stale-while-revalidate`).
- Keep personalized data in user-scoped server cache.

### 9) Introduce background precompute jobs

- Periodically precompute and store hot payloads for active users/channels.
- Incrementally update only changed fragments instead of recomputing entire payload.

### 10) Measure real user speed, not just lab speed

Track and alert on:

- TTFB (p75/p95)
- LCP (p75)
- Interaction readiness after navigation
- Cache hit ratio (client + server)
- Supabase query count per route

If a route regresses, block release until it returns within budget.

## Suggested priority order for this repo

1. Add `loading.tsx` and server-rendered skeletons to all primary routes.
2. Add a shared cache policy map and apply it to existing localStorage + server cache writes.
3. Build `rpc_get_profile_snapshot` to collapse profile page into one request.
4. Expand `/api/cache/warm` to warm profile snapshots.
5. Add link/data prefetch on sidebar navigation items.

## Reality check

"Everything instant" is not physically possible for uncached first-time personalized data, but with this approach users should perceive the app as instant because:

- UI appears immediately.
- Cached data paints immediately.
- Fresh data swaps in quickly without blocking interaction.
