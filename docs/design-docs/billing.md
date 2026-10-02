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
node --import tsx scripts/stripe/bootstrap.ts --mode both --currency usd --monthly 900 --dry-run

# Create test resources using the test key from `.dev.vars`.
node --import tsx scripts/stripe/bootstrap.ts --mode test --currency usd --monthly 900

# Live administration requires a live key injected into the process environment
# by an approved secret manager or secure shell session. Never put it in `.dev.vars`.
node --import tsx scripts/stripe/bootstrap.ts --mode live --currency usd --monthly 900
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
   `bootstrap.ts` refuses to reuse a lookup-key price that is archived, on
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

Every local Stripe script reads the test key from `STRIPE_SECRET_KEY=sk_test_...`
in `.dev.vars`, as `.dev.vars.example` lays it out; `STRIPE_TEST_SECRET_KEY` (or
`STRIPE_SECRET_KEY_TEST`) overrides it. They resolve it with
`resolveTestSecretKey()` in `scripts/stripe/_env.ts` and never accept a key that
does not start with `sk_test_`. In every Stripe script the process environment wins
over `.dev.vars`, so a key a secret manager injects for a one-off administrative command
is the one used.

```bash
# Idempotently create/confirm test resources.
node --import tsx scripts/stripe/bootstrap.ts --mode test --currency usd --monthly 900
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

The listener forwards to this checkout's own API, because every clone or worktree
runs its own server on a free port, and a fixed port could belong to another worktree,
whose API has a different signing secret and local D1. It uses the port in
`tmp/dev-session.json` while that server's launcher runs. Started first, it forwards to
the port `dev:all` would pick at that moment (skipping ports another worktree or
the smoke stack holds). `stripe listen` keeps its `--forward-to` for life, so the
listener restarts it on the right port if `dev:all` then chooses another; the saved
signing secret stays valid, since the CLI's secret is stable per account and device.
It prints each URL it forwards to. Set
`STRIPE_LOCAL_WEBHOOK_URL` (in the environment or `.dev.vars`) to forward
somewhere else; the listener then never changes it.

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
  when an open subscription is not paid up (`past_due`, `unpaid`, `paused`).
  Only `canceled` and `incomplete_expired` subscriptions allow a
  new Checkout, because Stripe would bill both subscriptions. The client opens the
  Customer Portal on `subscription_needs_attention`, and every checkout entry
  point reloads billing status on either `409` and on `plan_managed_by_support`:
  Billing and Pricing themselves, and every other page through the shared
  checkout path (`refreshBillingStatusOnCheckoutConflict` in
  `src/lib/access-flow.ts`), so a page that gates Pro features on a cached Free
  plan stops asking for checkout. My Templates' Start a Run dialog starts checkout
  without reading billing status first: with billing turned off, checkout answers
  `503 billing_unavailable`, which `startBillingCheckout` reports.
  An `incomplete` subscription is different: Checkout creates the subscription
  when the buyer submits payment, and a declined card or an abandoned 3DS step
  leaves it `incomplete` while its session stays open. Only a retry in that
  session can pay its first invoice (the Customer Portal cannot), and expiring
  the session cancels it. So a stored `incomplete` status does not refuse
  checkout on its own: checkout settles the open sessions and asks Stripe as
  below, and when every open subscription is `incomplete` and held by the
  session it keeps for reuse (`subscription` on the session), it returns that
  session's URL. An `incomplete` subscription no kept session holds (a payment
  still processing, or a cancel Stripe has not applied yet) returns
  `409 checkout_incomplete`, which the client shows without opening the portal;
  so does a stored `incomplete` status with no Stripe customer to ask. Billing and
  Pricing keep offering Upgrade for an `incomplete` status. An active manual override
  returns `409 plan_managed_by_support` before any Stripe call: an override outranks
  Stripe, so a subscription bought under a Free override would bill without ever
  granting Pro.
  Stored rows come from webhooks, which can lag or fail, and the stored customer
  can be one Stripe no longer has, so for a user with a Stripe customer Stripe
  decides: checkout lists the customer's subscriptions in Stripe
  (`GET /v1/subscriptions?customer=...`), stores them, and applies the same rules
  to what Stripe lists, whatever D1 holds for that customer. It reads one page of 100
  (Stripe's default filter leaves out canceled subscriptions, so the list stays short);
  a list with more pages fails closed unless what it shows already blocks checkout, and
  an `incomplete` subscription does not on its own. A subscription stored
  for any other customer is read by id (`GET /v1/subscriptions/{id}`): one Stripe
  has is stored and the same rules apply to it; one Stripe does not have (`404`,
  such as one made with the other mode's keys) no longer blocks, and its row is
  left as it was, because a key that cannot see a subscription does not prove it
  ended. Only a user with no Stripe customer is refused from stored rows alone,
  without a Stripe call. If Stripe cannot answer, checkout fails closed with
  `503 billing_unavailable` and creates no session.
  Every open Checkout Session stays payable for 24 hours and opens its own
  subscription, so before that subscription check, checkout lists the
  customer's open sessions (`GET /v1/checkout/sessions?customer=...&status=open`)
  and leaves at most one subscription session open. It keeps the newest session
  that matches this checkout (same user, same `metadata[checkoutParams]` digest
  of the price and return URLs, and at least an hour left, so the buyer has time to
  finish paying; Stripe lists sessions newest first) and expires every
  other one (`POST /v1/checkout/sessions/{id}/expire`). When no open
  subscription blocks checkout, it returns the kept session's URL instead of
  creating a new one, so a tab left on Checkout plus a later Upgrade cannot be
  paid twice. A session that stops being open while it is being expired (paid,
  or expired by a concurrent request) returns `409 checkout_in_progress`; the
  retry then sees the new subscription. A failed, incomplete (`has_more`), or
  unexpected session list fails closed with `503 billing_unavailable`.
  Stripe's Checkout setting "Limit customers to one subscription" would add a
  second safeguard. Nothing in this repository turns it on, and turning it on
  is a live Stripe change that a human must approve.
  A stored customer that Stripe no longer has (deleted in the Dashboard, or
  created with the other mode's keys) is replaced: when Stripe answers
  `resource_missing` for `customer`, checkout creates a new customer (with an
  idempotency key, so a double click creates one), swaps the mapping only if it
  still holds the missing id, and retries once. A deleted customer still lists its
  subscriptions (none), so it can show up only when the Checkout Session is created;
  checkout replaces it there the same way. Other Stripe errors never replace the
  customer. Subscriptions stored for the missing customer keep their
  rows (no webhook will update them); they stop blocking checkout and stop showing
  in billing status because they are no longer on the stored customer.
  The customer is never replaced while the user has an open stored subscription
  on a price in `proPriceIds`, on any customer: only the current keys' mode sells
  those prices, so "missing" then means the deployed keys are wrong (the other
  mode's secret key, say), and a replacement would move a paying subscriber to an
  empty customer. Checkout then answers from the stored status (`409
  already_subscribed`, `subscription_needs_attention` or `checkout_incomplete`),
  the portal answers `409 billing_customer_missing` asking the user to contact
  support, the mapping is left alone, and the API logs
  `stripe_customer_missing_with_subscription` (ids and status only).
  A first checkout creates the customer with the idempotency key
  `customer-<userId>-<email digest>`, so concurrent or retried first checkouts
  share one customer (a changed email makes a new key rather than a Stripe
  parameter-mismatch error), and stores the mapping with `ON CONFLICT DO NOTHING`: a
  mapping another request or the webhook stored first is kept, and that request
  gets `409 checkout_in_progress`, because the kept customer's subscriptions were not
  checked; the retry checks out as that customer. The Checkout idempotency key is the user, the
  customer id, a digest of the price and return URLs, and the five-minute window the
  request falls in, so a retry or double submit in that window joins one Checkout
  Session, which later checkouts reuse or expire. The customer and the digest are in
  the key because Stripe rejects a reused key whose parameters changed, as they do
  after a customer is replaced or for a request from another origin. When Stripe
  refuses a key that is still in flight (`idempotency_key_in_use`) or was used with
  other parameters (`idempotency_error`), checkout returns `409 checkout_in_progress`
  (try again in a moment) instead of a server error. The client also joins a
  second `startBillingCheckout` call to the one still pending.
- `POST /api/billing/portal` → returns `{ url }` to redirect user to Stripe Customer Portal,
  `409 no_billing_account` when the user has no Stripe customer (such as Pro
  granted by an override), or `409 billing_customer_missing` when Stripe no
  longer has the stored customer. That response first replaces the customer the
  way checkout does, so billing status stops showing the missing customer's stored
  subscriptions; Billing refetches status on it and offers Upgrade. While an open
  subscription on a current Pro price is stored, it keeps the customer and asks
  the user to contact support instead (see checkout above).
- Stripe returns the user to `/dashboard/settings/?billing=success` or
  `?billing=cancel` after Checkout, and to `/dashboard/settings/` from the Portal.
  Billing reads `billing=success` and polls Personal status (whichever context is
  selected) until the plan is Pro, then removes the parameter. Sessions created
  before this return URL send buyers to `/account?billing=...`, which redirects
  with the query intact. A buyer whose session ended while at Stripe signs in
  and lands back on the same URL, query included.
- `GET /api/billing/status` → returns `{ plan, limits, billingEnabled }` (`plan` is `free`, `pro`, or the legacy `team` for a paid Organization).
  In Personal context it also returns `subscriptionStatus` (the most urgent open
  subscription status, failed payments first and a status Stripe adds later after
  the known ones, or `null`; once the user has a
  Stripe customer, only that customer's subscriptions count, since the Customer
  Portal shows only those), `canManageBilling`
  (a Stripe customer exists), and `managedBySupport` (a manual override sets the
  plan). Organization context never includes them. Billing shows Manage
  subscription, not Upgrade, whenever `plan` is `pro` or `subscriptionStatus` is
  set. Under an override (Free or Pro), or for Pro without a Stripe customer, it
  says support manages the plan and shows no Upgrade, only Manage subscription
  for an existing customer.

Checkout and portal each call Stripe, whose rate limit the whole Stripe account
shares, so they are limited per IP and per account and answer `429` with
`Retry-After` ([rate limits](../SECURITY.md#rate-limits)).

Webhook:
- `POST /api/stripe/webhook` (verifies `Stripe-Signature`, idempotent via `stripe_webhook_events`)

## Implementation note
This project calls Stripe via `fetch` (form-encoded) and verifies webhook signatures using HMAC-SHA256 against the raw request body (no `stripe-node` dependency).

A failed Stripe call throws `StripeApiError` (`functions/api/utils/stripe.ts`) with the
HTTP status and Stripe's error `type`, `code` and `param`. Stripe's message text can
echo request data such as an email address, so it never enters the error message that
gets logged. A customer Stripe does not have in this mode (deleted, or made with the
other mode's keys) is `resource_missing` on `customer`, and checkout treats it as having
no open Checkout Sessions. Every reply is parsed with the Zod schema its caller passes
(`stripePostForm(secretKey, path, body, schema)`, or the caller's own parse of
`stripeGet`), so a reply that lacks a field the code reads fails the request instead
of passing `undefined` on.

A signed webhook body is parsed with `stripeEventSchema` (`functions/api/handlers/stripe.ts`)
after the signature check: an event without an `id` or `type`, or with a field of the
wrong type, is refused with `400` and records nothing, so Stripe retries it. A completed
Checkout's session is parsed with `checkoutSessionSchema`; one it cannot read is logged
as skipped and acknowledged, like one without a user or customer.

Webhook event rows provide idempotency and retry state
(`functions/api/utils/stripe-webhook-events.ts`). A row with no error records an
event whose writes committed: it is written in the same D1 batch (one
transaction) as the customer and subscription upserts, never before them, and a
replay of such an event is a duplicate. Any other event is processed: no row, or
a row with a recorded error. A failed write, a lost error record, or a Worker
stopped mid-delivery therefore leaves the event retryable. Processing failures
return `500` so Stripe delivers the event again, and the error is recorded best
effort without overwriting a row a concurrent delivery already marked handled.
Two deliveries of one event can both process it; the writes are upserts, so the
second changes nothing.
Events the webhook does not act on (such as `invoice.*`) are recorded as handled.
A subscription event for an unknown or deleted user is logged and acknowledged
rather than retried, since a deleted user's subscription row would fail its foreign
key on every retry. Subscription events upsert their customer mapping together
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
Newer Stripe API versions report `current_period_end` on each subscription item
rather than on the subscription, so the stored period end is the subscription's, or
else its first item's.

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
