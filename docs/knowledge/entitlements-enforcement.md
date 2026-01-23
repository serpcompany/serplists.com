# Entitlements enforcement (MVP)

Source of truth: Stripe subscription state stored in D1 (`stripe_subscriptions`) plus optional future overrides.

## Current enforcement (server-side)
- `POST /api/templates`: Free users can have **max 1** template; Pro is unlimited.
- `POST /api/checklists`: Free users can have **max 3** `in_progress` runs; Pro is unlimited.

## Current enforcement (UI)
- Account page shows plan + Upgrade/Manage button (Stripe Checkout + Customer Portal).

## Notes
- Import/export gating is not separately enforceable today because import/export is client-side; the Free template cap blocks multi-template imports in practice.
- Optional admin override endpoint exists if `ENTITLEMENTS_ADMIN_SECRET` is set: `POST /api/admin/entitlements/override`.
