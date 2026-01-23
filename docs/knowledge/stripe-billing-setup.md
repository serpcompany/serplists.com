# Stripe billing setup (Pro subscriptions)

## URLs
- Pages domain: `https://serp-checklists.pages.dev`
- Webhook: `https://serp-checklists.pages.dev/api/stripe/webhook`

## Required secrets (Cloudflare Pages)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`

## Bootstrap (create Product + Prices)
If you want to create Stripe resources programmatically, use:

```bash
# Dry-run (no network calls)
node scripts/stripe/bootstrap.mjs --mode both --currency usd --monthly 1900 --dry-run

# Create in BOTH test + live (requires STRIPE_TEST_SECRET_KEY + STRIPE_LIVE_SECRET_KEY in .env)
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
