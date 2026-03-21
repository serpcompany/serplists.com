# Stripe webhook retry and idempotency notes (2026-03-20)

## Problem found

- The webhook handler inserted the event id into `stripe_webhook_events` before processing.
- If processing then failed, the handler still returned `200`.
- Because the event id already existed, Stripe retries would be treated as duplicates and never reprocessed.

## Why that matters

- A transient DB or mapping failure could permanently block a subscription update from ever applying.
- That means a paid user could complete checkout but never get the local entitlement update.

## Fix

- Webhook processing failures now return `500`, so Stripe retries the event.
- If a retry arrives for an event that already exists **with a recorded error**, the handler now reprocesses it instead of short-circuiting as a duplicate.
- If the existing event row has no error, it is still treated as a true duplicate and ignored.

## Extra hardening

- `checkout.session.completed` now falls back to `metadata.userId` if `client_reference_id` is missing.
- `customer.subscription.*` events now also upsert the `stripe_customers` mapping before writing `stripe_subscriptions`.

## Verification

- Added unit coverage for:
  - metadata fallback on checkout completion
  - customer mapping upsert from subscription events
  - duplicate-event short circuit
  - `500` on failed processing
  - retrying a previously failed event instead of ignoring it
