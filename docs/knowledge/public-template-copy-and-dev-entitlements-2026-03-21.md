# Public template copy and dev entitlements

## Problem observed
- Logged-in non-owners opening a shared public template at `/checklists/:slug` did not see a copy/add CTA.
- The same template opened at `/templates/:id` did show `Copy to My Templates`.
- Local test personas labeled `Admin (Pro)` and `Jane (Pro)` were still resolving as Free.

## Root cause
- `src/pages/PublicTemplate.tsx` hid the copy CTA whenever Stripe checkout was unavailable.
- The local seed data renamed the personas but did not seed matching `entitlement_overrides`.

## Fix
- Public shared templates now show a copy CTA to all users.
- Guests are sent to login, Free users are sent into upgrade flow, and Pro users can copy successfully.
- The template detail route uses the same copy gating so Free users cannot bypass the public share flow.
- Local seed data now inserts Pro entitlement overrides for `admin@test.com` and `jane@test.com`.
- A dev-safe fallback keeps those two seeded personas on Pro before the local database is reseeded.
