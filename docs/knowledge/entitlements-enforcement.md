# Entitlements enforcement (MVP)

Source of truth: Stripe subscription state stored in D1 (`stripe_subscriptions`) plus optional future overrides.

## Current enforcement (server-side)
- `POST /api/templates`: Free users can have **max 1** template; Pro is unlimited.
- `POST /api/checklists`: Free users can have **max 3** `in_progress` runs; Pro is unlimited.
- `GET /api/templates/backup` + `POST /api/templates/backup`: **Pro only** (template export/import).
- `POST /api/templates/:id/clone`: follows template entitlement limits (`maxTemplates`), allowing free users within limit and prompting upgrade at limit.

## Current enforcement (UI)
- Account page shows plan + Upgrade/Manage button (Stripe Checkout + Customer Portal).
- Templates page disables import/export UI for Free and offers an Upgrade button.
- Public template pages show **Save to My Templates** for logged-in users and prompt upgrade if save is limited by plan.

## Notes
- Optional admin override endpoint exists if `ENTITLEMENTS_ADMIN_SECRET` is set: `POST /api/admin/entitlements/override`.
