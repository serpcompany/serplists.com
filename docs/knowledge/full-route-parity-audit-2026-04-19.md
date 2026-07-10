# Full Route Parity Audit (2026-04-19)

Compared against the live current app at `http://127.0.0.1:8788` and the canonical `v0` app at `http://127.0.0.1:3000`.

Source of truth for target UI:

- local code: `/Users/devin/dev/repos/v0-serplists-com-v0-design`
- live docs: `https://v0-serplists-com-v0-design.vercel.app/docs`

This audit covers the entire current router surface. Routes are classified as:

- `close`: mostly aligned to `v0`, only polish/detail gaps remain
- `partial`: same product surface, but still structurally or visually different
- `mismatch`: materially different page structure or behavior from `v0`
- `broken`: current route fails to deliver the expected surface
- `alias`: current-only alias or redirect, not a distinct surface
- `no counterpart`: current route has no direct `v0` equivalent

## Summary

- Closest route today: `/dashboard/templates`
- Strong partials: `/login` when logged out, `/dashboard/runs/:id`
- Biggest remaining mismatches in core product flows:
  `/register`, `/forgot-password`, `/reset-password`,
  `/categories`, `/categories/:categorySlug`,
  `/profile/:username`, `/dashboard`, `/dashboard/runs`,
  `/dashboard/templates/:id`, `/dashboard/templates/new`,
  `/dashboard/templates/:id/edit`, `/account`
- Broken route:
  `/share/:shareToken`
- Route-model problem still present:
  `/run/:id` renders the private run screen in the public shell instead of behaving like a canonical private run route

## Comparable Routes

| Current route | `v0` route | Status | Notes |
| --- | --- | --- | --- |
| `/` | `/` | `mismatch` | Current home is a marketing/product page; `v0` home is a prototype surface hub. |
| `/login` | `/login` | `partial` | Logged-out structure now tracks the `v0` login page much more closely. Logged-in users auto-redirect to `/account`, which is expected behavior but means live comparison must be done signed out. |
| `/register` | `/signup` | `mismatch` | Current page still uses the old `AuthPageShell` flow and does not match the `v0` standalone sign-up layout. |
| `/forgot-password` | `/forgot-password` | `mismatch` | Same product intent, but current page is still on the old auth shell. |
| `/reset-password` | `/reset-password` | `mismatch` | Same product intent, but current page is still on the old auth shell and does not match the `v0` reset layout. |
| `/templates` | `/templates` | `partial` | Same browse surface and headline, but current page still uses the main site shell and a simpler filter/discovery treatment than `v0`. |
| `/categories` | `/categories` | `mismatch` | Current page is a simple category list; `v0` has a fuller category landing page with featured and grouped discovery sections. |
| `/categories/:categorySlug` | `/categories/[slug]` | `mismatch` | Current route is a filtered library view; `v0` has a dedicated category-detail page structure. |
| `/profile/:username` | `/profile/[username]` | `mismatch` | Current creator profile uses an older info/stats layout; `v0` uses a much cleaner creator page with direct template cards. |
| `/profile/:username/:templateSlug` | `/profile/[username]/[slug]` | `partial` | CTA row is closer after recent changes, but the body structure still differs: current uses a docs-style rail; `v0` uses a more explicit evaluation page with stats/tag/creator blocks. |
| `/dashboard` | `/dashboard` | `mismatch` | Current route redirects to `/dashboard/templates`; `v0` has its own dashboard home surface. |
| `/dashboard/runs` | `/dashboard/runs` | `mismatch` | Same purpose, but current page is still the older run-management screen, not the `v0` “My Runs” layout. |
| `/dashboard/templates` | `/dashboard/templates` | `close` | This is the closest current route to `v0`: shell, heading, and card vocabulary are now broadly aligned, though filters/actions still differ. |
| `/dashboard/templates/new` | `/dashboard/templates/new` | `partial` | Header is closer, but the editor body/sidebar/panel composition still uses the older local editor model instead of the `v0` outline + panel architecture. |
| `/dashboard/templates/:id` | `/dashboard/templates/[id]` | `mismatch` | Current private template detail remains structurally different from `v0`. |
| `/dashboard/templates/:id/edit` | `/dashboard/templates/[id]/edit` | `partial` | Same gap as create: top bar improved, body still materially different. |
| `/dashboard/runs/:id` | `/run/[id]` | `partial` | Current route now uses `v0`-style progress sidebar + task panel, but header/title/status and full page framing still differ. |
| `/share/:shareToken` | `/share/[token]` | `broken` | A generated current share token rendered an error page with “Try Again / Refresh Page”; `v0` share route rendered the expected shared run surface. |
| `/account` | `/dashboard/settings` | `mismatch` | Current account page is a different product/settings layout than the `v0` settings surface. |

## Alias / Redirect Routes

These are not distinct surfaces, but they still matter for route-model parity.

| Current route | Status | Notes |
| --- | --- | --- |
| `/checklists` | `alias` | Redirects to `/templates`. |
| `/console` | `alias` | Redirects to `/dashboard/templates` instead of a dedicated dashboard home. |
| `/console/templates/:id` | `alias` | Legacy alias for private template detail. |
| `/console/templates/:id/edit` | `alias` | Legacy alias for template edit. |
| `/console/runs/:id` | `alias` | Legacy alias for run detail. |
| `/dashboard/profile` | `alias` | Redirects to the public profile route. |
| `/dashboard/settings` | `alias` | Redirects to `/account` rather than rendering a first-class dashboard settings screen. |
| `/run/:id` | `mismatch` | Not just an alias problem: current route renders the private run surface inside the public shell, which does not match the dashboard/private route model. |

## Routes With No Direct `v0` Counterpart

| Current route | Status | Notes |
| --- | --- | --- |
| `/features` | `no counterpart` | Current marketing route only. |
| `/features/:featureSlug` | `no counterpart` | Current route exists, but sample slug handling looked incomplete in live audit. |
| `/pricing` | `no counterpart` | Current marketing route only. |
| `/about` | `no counterpart` | Current marketing route only. |
| `/contact` | `no counterpart` | Current marketing route only. |
| `*` | `no counterpart` | Standard not-found route. |

## Immediate Priorities

1. Fix `/share/:shareToken` so a valid shared run actually renders.
2. Decide the canonical private run story between `/dashboard/runs/:id` and `/run/:id`; today the second route still behaves incorrectly.
3. Replace the auth pages other than `/login` with direct `v0` compositions.
4. Rebuild the editor body to match the `v0` outline/sidebar/panel architecture.
5. Add a dedicated dashboard home or explicitly remove `/dashboard` as a distinct route if templates is intended to be the home surface.
6. Rework category/profile/detail discovery routes to use the `v0` discovery page structures rather than old local layouts.
