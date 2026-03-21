# Stripe billing gate vs webhook config

## Symptom

`/api/billing/status` returned `billingEnabled: false` and the account page rendered `Upgrade unavailable` even though live Stripe checkout config was present.

## Cause

The billing status and checkout endpoints were gated by the same helper that required all three values:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`

That mixed two separate concerns:

- billing checkout capability
- webhook verification capability

If the webhook secret was missing or not visible at runtime, the UI incorrectly disabled checkout.

## Fix

Split Stripe config handling into:

- billing config: `STRIPE_SECRET_KEY` + `STRIPE_PRO_PRICE_ID`
- webhook config: `STRIPE_WEBHOOK_SECRET`

Use billing config for:

- `/api/billing/status`
- `/api/billing/checkout`
- `/api/billing/portal`
- subscription entitlement lookup

Use webhook config only for:

- `/api/stripe/webhook`

## Verification

- Unit: `pnpm vitest run tests/unit/functions/api/billing-handler.test.ts --reporter=dot`
- Browser: logged in as `john@test.com`, opened `/account`, confirmed `Upgrade to Pro`, clicked it, and observed redirect to `https://checkout.stripe.com/...`
