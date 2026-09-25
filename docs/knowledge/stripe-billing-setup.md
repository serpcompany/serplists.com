# Stripe billing setup (Pro subscriptions)

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
webhook configuration.

## Bootstrap (create Product + Prices)
If you want to create Stripe resources programmatically, use:

```bash
# Dry-run (no network calls)
node scripts/stripe/bootstrap.mjs --mode both --currency usd --monthly 900 --dry-run

# Create in BOTH test + live (configure keys in `.dev.vars` locally and Cloudflare Pages env in production)
node scripts/stripe/bootstrap.mjs --mode both --currency usd --monthly 900

# Optional yearly price (example)
node scripts/stripe/bootstrap.mjs --mode both --currency usd --monthly 900 --yearly 9000
```

After creating prices, set `STRIPE_PRO_PRICE_ID` in Cloudflare Pages to the **live** monthly `price_...` id.

The launch price is **$9 USD per month**. If the amount changes, update the
Stripe Price and `PRO_MONTHLY_PRICE_LABEL` in `src/lib/billing.ts` together.

## Customer Portal

Create or reuse the app-owned live Customer Portal configuration:

```bash
pnpm run stripe:portal:configure
```

Set the returned `bpc_...` id as `STRIPE_PORTAL_CONFIGURATION_ID` in the
production Pages environment. Use `pnpm run stripe:portal:configure -- --test`
for a separate test-mode configuration.

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
- `POST /api/billing/checkout` → returns `{ url }` to redirect user to Stripe Checkout
- `POST /api/billing/portal` → returns `{ url }` to redirect user to Stripe Customer Portal
- `GET /api/billing/status` → returns `{ plan: "free" | "pro" }`

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
