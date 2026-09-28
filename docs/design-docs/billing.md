# Billing

Personal Pro subscriptions run on Stripe. What each plan includes is specified in
[pricing and entitlements](../product-specs/pricing-and-entitlements.md); manual
plan overrides without Stripe are in [SECURITY.md](../SECURITY.md#admin-entitlement-override).
Plans resolve in `functions/api/utils/entitlements.ts`.

## URLs
- Pages domain: `https://serplists.com`
- Webhook: `https://serplists.com/api/stripe/webhook`

## Required secrets (Cloudflare Pages)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_PORTAL_CONFIGURATION_ID`

Checkout capability requires `STRIPE_SECRET_KEY` and `STRIPE_PRO_PRICE_ID`.
Webhook verification separately requires `STRIPE_WEBHOOK_SECRET`. Billing
status, checkout, portal, and subscription lookup must not be disabled solely
because the webhook secret is absent; only the webhook endpoint depends on
webhook configuration. The webhook also uses `STRIPE_SECRET_KEY`, when set, to
read a subscription's current state (see the implementation note).

## Bootstrap (create Product + Prices)
If you want to create Stripe resources programmatically, use:

```bash
# Dry-run (no network calls)
node scripts/stripe/bootstrap.mjs --mode both --currency usd --monthly 900 --dry-run

# Create test resources using the test key from `.dev.vars`.
node scripts/stripe/bootstrap.mjs --mode test --currency usd --monthly 900

# Live administration requires a live key injected into the process environment
# by an approved secret manager or secure shell session. Never put it in `.dev.vars`.
node scripts/stripe/bootstrap.mjs --mode live --currency usd --monthly 900
```

After creating prices, set `STRIPE_PRO_PRICE_ID` in Cloudflare Pages to the **live** monthly `price_...` id.

The launch price is **$9 USD per month**. If the amount changes, update the
Stripe Price and `PRO_MONTHLY_PRICE_LABEL` in `src/lib/billing.ts` together.

## Customer Portal

Create or reuse the app-owned test Customer Portal configuration using local
test credentials:

```bash
pnpm run stripe:portal:configure -- --test
```

For live Portal administration, inject `STRIPE_LIVE_SECRET_KEY` through the
process environment and run `pnpm run stripe:portal:configure`. Set the returned
`bpc_...` id only in the Cloudflare Production environment.

## Local end-to-end test

`.dev.vars` is local-only and must never contain a live Stripe key or a `*_LIVE`
alias. The local setup helper fails closed when it detects either. For a checkout
that previously mixed environments, scrub production-only Stripe entries first:

```bash
pnpm run stripe:local:scrub-live
```

The helper then configures `.dev.vars` with only the test product, price, and
Portal configuration.

```bash
# Idempotently create/confirm test resources.
node scripts/stripe/bootstrap.mjs --mode test --currency usd --monthly 900
pnpm run stripe:portal:configure -- --test
pnpm run stripe:local:setup

# Apply and seed local D1.
pnpm run db:migrate:d1:local
pnpm run db:seed
```

Start the webhook listener first. It saves the temporary test signing secret
to `.dev.vars` without printing it:

```bash
pnpm run stripe:local:listen
```

After the listener reports that the secret was saved, start the app in another
terminal so the API reads that secret at startup:

```bash
pnpm dev:auto
```

Sign in as a Free local persona, choose **Upgrade — $9/month**, and use Stripe's
test Visa `4242 4242 4242 4242`, any future expiry, and any three-digit CVC.
Verify the Personal plan changes to Pro, a paid-only API action succeeds, the
Customer Portal opens, and cancellation remains active through period end.

## Webhook configuration
Webhook “Events from”: **Your account**

Webhook “Events” (selected):
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## App endpoints
Authenticated:
- `POST /api/billing/checkout` → returns `{ url }` to redirect user to Stripe Checkout.
  It returns `409 already_subscribed` when the user has Pro or an `active` or
  `trialing` subscription on any price, and `409 subscription_needs_attention`
  when an open subscription is not paid up (`past_due`, `unpaid`, `paused`,
  `incomplete`). Only `canceled` and `incomplete_expired` subscriptions allow a
  new Checkout, because Stripe would bill both subscriptions. The client opens the
  Customer Portal on `subscription_needs_attention`. An active manual override
  returns `409 plan_managed_by_support` before any Stripe call.
- `POST /api/billing/portal` → returns `{ url }` to redirect user to Stripe Customer Portal
- `GET /api/billing/status` → returns `{ plan, limits, billingEnabled }` (`plan` is `free`, `pro`, or the legacy `team` for a paid Organization).
  In Personal context it also returns `subscriptionStatus` (the most urgent open
  subscription status, failed payments first, or `null`), `canManageBilling`
  (a Stripe customer exists), and `managedBySupport` (a manual override sets the
  plan). Organization context never includes them. Billing shows Manage
  subscription, not Upgrade, whenever `plan` is `pro` or `subscriptionStatus` is
  set; under a Free override it shows no Upgrade, only Manage subscription for an
  existing customer.

Webhook:
- `POST /api/stripe/webhook` (verifies `Stripe-Signature`, idempotent via `stripe_webhook_events`)

## Implementation note
This project calls Stripe via `fetch` (form-encoded) and verifies webhook signatures using HMAC-SHA256 against the raw request body (no `stripe-node` dependency).

Webhook event rows provide idempotency and retry state. A successfully handled
event is a duplicate on replay. An event with a recorded processing error must
be retried, and processing failures return `500` so Stripe will deliver the
event again. Subscription events upsert their customer mapping before writing
subscription state; checkout completion may use `metadata.userId` when
`client_reference_id` is absent.

Stripe does not deliver events in order, and a retried event carries its original,
possibly stale, snapshot. So `customer.subscription.*` events are only a trigger:
the webhook reads the subscription's current state with
`GET /v1/subscriptions/{id}` (using `STRIPE_SECRET_KEY`) and stores that
(`functions/api/utils/stripe-subscriptions.ts`). A snapshot that is already
`canceled` or `incomplete_expired` is final and is stored without the read. If the
read fails, the event returns `500` and Stripe retries it; if Stripe reports the
subscription does not exist, the event is acknowledged without a write. The upsert
also refuses transitions Stripe never makes: a `canceled` or `incomplete_expired`
row is never overwritten, and no row returns to `incomplete`. Without
`STRIPE_SECRET_KEY` the webhook stores the event snapshot under that same guard.

## Production verification

1. Run `pnpm exec wrangler pages secret list --project-name serplists-com` and
   confirm all four Stripe variable names are present. Values remain encrypted.
2. Run `pnpm run db:migrations:check:prod`.
3. Sign in as a Free production user and complete a real $9 Checkout payment.
4. Confirm Account shows Pro, then open the Customer Portal and cancel at the
   end of the billing period.
5. Confirm Stripe reports successful webhook deliveries and the account stays
   Pro until the paid period ends.
6. Refund the verification payment in Stripe if it was only a launch test.
