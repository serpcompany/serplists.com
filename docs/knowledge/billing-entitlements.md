# Billing + entitlements decision (MVP)

Canonical launch plan matrix: `docs/product/plans.md`

## Decision summary
- **Billing provider:** Stripe subscriptions.
- **Plans:** Free + Pro.
- **Launch approach:** keep the plan split intentionally small and add more gated features over time only when needed.

## Launch-gated feature
### Free
- Can use the core product unless a feature is explicitly gated in `docs/product/plans.md`.

### Pro
- Includes everything in Free.
- `Copy templates into your account`

## Enforcement approach (when implemented)
- **API is source of truth** for entitlements (UI gating is additive only).
- Recommended behavior:
  - Block paid-only actions with a consistent error shape (for example `403` + `{ code: "paid_required" }`).
  - Return current plan/limits from a single place (so UI and API agree).

## Stripe mapping (when implemented)
- One Stripe **Product** (“SERP Lists Pro”)
- One Stripe **Price** (monthly; add annual later if needed)
- Use Stripe **Customer Portal** for managing subscription/invoices.
- Webhook-driven state:
  - Store entitlement state in D1 (plan + subscription status + period end).
  - Keep an event log for idempotency/debugging (Stripe event id).

## Current state note
Earlier notes in this file listed broader entitlement ideas. For launch, defer to `docs/product/plans.md` and keep the actual paid split minimal.
