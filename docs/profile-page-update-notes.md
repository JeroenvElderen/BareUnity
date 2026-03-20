# Profile Page Update Notes (WIP)

This file tracks the current profile page implementation so it can be safely edited after pushing to GitHub.

## Current status

The profile page is a **work in progress** and currently includes:

- Naturist-themed profile hero/header with badges and actions.
- Community stats and profile principles chips.
- About section with skill progress bars.
- Recent posts section.
- Media preview + popup masonry gallery.

## Files involved

- `src/app/profile/page.tsx`
- `src/components/profile/media-gallery.tsx`
- `src/components/profile/profile-section.tsx`
- `src/components/ui/avatar.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/app/globals.css`

## Design/theme guidance

To keep changes aligned with the app theme, continue using the existing CSS variables in `globals.css`:

- `--bg`, `--bg-soft`, `--bg-deep`
- `--text`, `--text-strong`, `--muted`
- `--border`, `--ring`
- `--brand`, `--brand-2`
- `--accent`, `--accent-soft`
- `--success`, `--warning`, `--error`

## Easy places to edit later

### 1) Profile content

In `src/app/profile/page.tsx`, update these arrays:

- `stats`
- `principles`
- `skills`
- `posts`

This is the fastest way to refresh page content.

### 2) Hero/header actions

In `src/app/profile/page.tsx` (top card):

- Change CTA labels (`Share profile`, `Edit cover`, `Message`, `Follow`)
- Adjust hero gradient classes
- Replace user identity text and badges

### 3) Media gallery behavior

In `src/components/profile/media-gallery.tsx`:

- Edit `mediaItems` for new uploaded media
- Change masonry item sizes via `height` values (`h-52`, `h-80`, etc.)
- Replace placeholder gradient cards with real images if desired
- Add filters/tabs if gallery grows

## Suggested next improvements

- Connect `mediaItems` to real uploaded media from your DB/storage.
- Add upload action and delete/edit controls for gallery items.
- Add post detail modal or route from each post card.
- Add profile tabs (About / Media / Journal / Events).
- Add mobile-specific refinements for modal spacing.

## Pre-push checklist for future edits

1. Run: `npx eslint src/app/profile/page.tsx src/components/profile/media-gallery.tsx src/components/profile/profile-section.tsx`
2. Verify `/profile` visually in dev mode.
3. Ensure copy stays respectful and community-safe.
4. Confirm colors still use project CSS variables.

---

Owner note: **Profile page is intentionally unfinished and expected to evolve.**