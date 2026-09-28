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
- `STRIPE_PRO_LEGACY_PRICE_IDS` (optional; see [Changing the Pro price](#changing-the-pro-price))

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

The launch price is **$9 USD per month**.

## Changing the Pro price

A Stripe Price's amount cannot be edited, and existing subscriptions stay on the
price they were created with. Pro is granted for `STRIPE_PRO_PRICE_ID` plus any
price listed in `STRIPE_PRO_LEGACY_PRICE_IDS`; Checkout always uses
`STRIPE_PRO_PRICE_ID`. Changing the price is a pricing decision, so get approval
first, then:

1. Create a new Price on the Pro product in Stripe, moving the
   `serp-checklists_pro_monthly` lookup key to it (`transfer_lookup_key`).
   `bootstrap.mjs` refuses to reuse a lookup-key price that is archived, on
   another product, or differs from the request in amount, currency, or
   interval, and prints each price id with its amount.
2. Append the old price id to `STRIPE_PRO_LEGACY_PRICE_IDS` (comma-separated)
   **before** pointing `STRIPE_PRO_PRICE_ID` at the new price. Otherwise every
   subscriber on the old price resolves to Free.
3. Set `STRIPE_PRO_PRICE_ID` to the new price and update
   `PRO_MONTHLY_PRICE_LABEL` in `src/lib/billing.ts` together.
4. Remove an id from the legacy list only after no active subscription uses it
   (for example after migrating subscriptions in Stripe and receiving their
   `customer.subscription.updated` webhooks).

Test-mode and live price ids differ, so set the list per environment.

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
  Customer Portal on `subscription_needs_attention`, and Billing and Pricing
  refetch billing status on either `409`. An active manual override
  returns `409 plan_managed_by_support` before any Stripe call.
  Stored rows come from webhooks, which can lag or fail, so when D1 shows no
  open subscription and the user has a Stripe customer, checkout also lists the
  customer's subscriptions in Stripe (`GET /v1/subscriptions?customer=...`),
  stores them, and applies the same rules. If Stripe cannot answer, checkout
  fails closed with `503 billing_unavailable` and creates no session.
  A stored customer that Stripe no longer has (deleted in the Dashboard, or
  created with the other mode's keys) is replaced: when Stripe answers
  `resource_missing` for `customer`, checkout creates a new customer (with an
  idempotency key, so a double click creates one), swaps the mapping only if it
  still holds the missing id, and retries once. Other Stripe errors never
  replace the customer.
  A first checkout creates the customer with the idempotency key
  `customer-<userId>-<email digest>`, so concurrent or retried first checkouts
  share one customer, and stores the mapping with `ON CONFLICT DO NOTHING`: a
  mapping another request or the webhook stored first is kept, and that request
  gets `409 checkout_in_progress`. The Checkout idempotency key includes the
  customer id and a digest of the price and return URLs. When Stripe refuses a
  key that is still in flight (`idempotency_key_in_use`) or was used with other
  parameters (`idempotency_error`), checkout returns `409 checkout_in_progress`
  (try again in a moment) instead of a server error. The client also joins a
  second `startBillingCheckout` call to the one still pending.
- `POST /api/billing/portal` → returns `{ url }` to redirect user to Stripe Customer Portal,
  `409 no_billing_account` when the user has no Stripe customer (such as Pro
  granted by an override), or `409 billing_customer_missing` when Stripe no
  longer has the stored customer
- Stripe returns the user to `/dashboard/settings?billing=success` or
  `?billing=cancel` after Checkout, and to `/dashboard/settings` from the Portal.
  Billing reads `billing=success` and polls Personal status (whichever context is
  selected) until the plan is Pro, then removes the parameter. Sessions created
  before this return URL send buyers to `/account?billing=...`, which redirects
  with the query intact.
- `GET /api/billing/status` → returns `{ plan, limits, billingEnabled }` (`plan` is `free`, `pro`, or the legacy `team` for a paid Organization).
  In Personal context it also returns `subscriptionStatus` (the most urgent open
  subscription status, failed payments first, or `null`), `canManageBilling`
  (a Stripe customer exists), and `managedBySupport` (a manual override sets the
  plan). Organization context never includes them. Billing shows Manage
  subscription, not Upgrade, whenever `plan` is `pro` or `subscriptionStatus` is
  set. Under an override (Free or Pro), or for Pro without a Stripe customer (a
  local test persona), it says support manages the plan and shows no Upgrade,
  only Manage subscription for an existing customer.

Webhook:
- `POST /api/stripe/webhook` (verifies `Stripe-Signature`, idempotent via `stripe_webhook_events`)

## Implementation note
This project calls Stripe via `fetch` (form-encoded) and verifies webhook signatures using HMAC-SHA256 against the raw request body (no `stripe-node` dependency).

Webhook event rows provide idempotency and retry state
(`functions/api/utils/stripe-webhook-events.ts`). A row with no error records an
event whose writes committed: it is written in the same D1 batch (one
transaction) as the customer and subscription upserts, never before them, and a
replay of such an event is a duplicate. Any other event is processed: no row, or
a row with a recorded error. A failed write, a lost error record, or a Worker
stopped mid-delivery therefore leaves the event retryable. Processing failures
return `500` so Stripe delivers the event again, and the error is recorded best
effort without overwriting a row a concurrent delivery already marked handled.
Events the webhook does not act on (such as `invoice.*`) are recorded as handled.
A subscription event for an unknown or deleted user is logged and acknowledged
rather than retried. Subscription events upsert their customer mapping together
with subscription state; checkout completion may use `metadata.userId` when
`client_reference_id` is absent. A completed subscription-mode Checkout also
reads its subscription from Stripe and stores it, so Pro does not wait on a late
or lost `customer.subscription.*` event. An event for a `canceled` or
`incomplete_expired` subscription maps its customer only when the user has none,
so a late event for a replaced customer cannot restore the old mapping.

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
