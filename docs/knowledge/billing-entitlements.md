# Billing + entitlements decision (MVP)

## Decision summary
- **Billing provider (when we add billing):** Stripe subscriptions.
- **Plans:** Free + Pro (single Pro tier to start).
- **MVP launch:** can ship with **Free-only** (no Stripe yet). Entitlements default to Free for all users until Stripe is implemented.

## Entitlements (what each plan can do)
### Free
- **Reusable templates in account:** 1
- **Checklist runs “in progress” at once:** 3
- **Template import/export:** not available
- **Add marketplace template to account:** not available

### Pro
- **Reusable templates in account:** unlimited
- **Checklist runs “in progress” at once:** unlimited
- **Template import/export:** available
- **Add marketplace template to account:** available

## Enforcement approach (when implemented)
- **API is source of truth** for entitlements (UI gating is additive only).
- Recommended behavior:
  - Block paid-only actions with a consistent error shape (e.g. `403` + `{ code: "paid_required" }`).
  - Return current plan/limits from a single place (so UI and API agree).

## Stripe mapping (when implemented)
- One Stripe **Product** (“SERP Checklists Pro”)
- One Stripe **Price** (monthly; add annual later if needed)
- Use Stripe **Customer Portal** for managing subscription/invoices.
- Webhook-driven state:
  - Store entitlement state in D1 (plan + subscription status + period end).
  - Keep an event log for idempotency/debugging (Stripe event id).

## Current state note
Some import guardrails already exist (max templates/import and asset size checks), but plan-based gating is not implemented yet.

