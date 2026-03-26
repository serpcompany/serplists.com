# Figma design lock (2026-03-24)

Issue `#38` now has a live low-to-mid fidelity Figma board in the Serplists project file.

## Figma location

- File: `serplists.com`
- Page: `Route Lock / #38`

## Frames created

- `00 / Route Lock Overview`
- `01 / Public / Templates`
- `02 / Public / Profile`
- `03 / Public / Template Detail`
- `04 / Secondary Patterns`
- `05 / Console / Home`
- `06 / Console / Templates`
- `07 / Console / Runs`
- `08 / Mobile Shells`

## Frozen decisions

### 1. Public discovery shell vs console shell

- Public pages use a lighter discovery shell with marketing/discovery navigation.
- Console pages use a darker operational shell with a persistent left-side navigation pattern.
- `#36` should preserve that shell contrast instead of blending public and private surfaces together again.

### 2. Public core pages get the heavy treatment

The strongest structural emphasis belongs to:

- `/templates`
- `/profile/{username}`
- `/profile/{username}/{templateSlug}`

Those are the main discovery and conversion surfaces.

### 3. Secondary public pages stay lighter

These routes inherit the public shell but should not receive the same visual weight as the core discovery pages:

- `/categories/{categorySlug}`
- `/features/{featureSlug}`
- `/share/{shareToken}`

`/share/{shareToken}` should remain a minimal shared-run surface and stay `noindex, nofollow`.

### 4. Template detail pages use a sticky action rail

- Content preview stays left.
- The main save/start actions stay in the right rail.
- `#36` should not move the primary CTA below the full content preview.

### 5. Console pages optimize scanning and action density

- `/console` behaves like an operational home, not a public landing page.
- `/console/templates` favors list/table density over marketplace cards.
- `/console/runs` favors quick scanning into a result/detail view.

### 6. Mobile preserves responsibilities, not layout

- Public mobile remains browse-first.
- Public detail keeps the sticky save/start action visible.
- Console mobile keeps the action-dense behavior, but the sidebar becomes a drawer.

## Build notes for `#36`

- Reuse the route-to-frame mapping from the Figma board.
- Treat the frames as structural guidance first and polish targets second.
- Improve hierarchy and component quality without reopening the route model or shell split from `#33`.
- Keep the main CTA ownership consistent with the frames:
  - library/category/profile pages: discovery first
  - public template detail: save/start rail
  - console pages: management and result actions first

## Verification used

- Bridge page check via `page.current` confirmed the page contains the board title plus all 9 frames.
- Direct PNG exports were generated from representative live Figma frames:
  - `tmp/figma-route-lock-overview.png`
  - `tmp/figma-route-lock-console-home.png`
  - `tmp/figma-route-lock-mobile.png`
