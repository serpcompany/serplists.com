# Stripe billing setup (Pro subscriptions)

## URLs
- Pages domain: `https://serplists.com`
- Webhook: `https://serplists.com/api/stripe/webhook`

## Required secrets (Cloudflare Pages)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`

Checkout capability requires `STRIPE_SECRET_KEY` and `STRIPE_PRO_PRICE_ID`.
Webhook verification separately requires `STRIPE_WEBHOOK_SECRET`. Billing
status, checkout, portal, and subscription lookup must not be disabled solely
because the webhook secret is absent; only the webhook endpoint depends on
webhook configuration.

## Bootstrap (create Product + Prices)
If you want to create Stripe resources programmatically, use:

```bash
# Dry-run (no network calls)
node scripts/stripe/bootstrap.mjs --mode both --currency usd --monthly 1900 --dry-run

# Create in BOTH test + live (configure keys in `.dev.vars` locally and Cloudflare Pages env in production)
node scripts/stripe/bootstrap.mjs --mode both --currency usd --monthly 1900

# Optional yearly price (example)
node scripts/stripe/bootstrap.mjs --mode both --currency usd --monthly 1900 --yearly 19000
```

After creating prices, set `STRIPE_PRO_PRICE_ID` in Cloudflare Pages to the **live** monthly `price_...` id.

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
