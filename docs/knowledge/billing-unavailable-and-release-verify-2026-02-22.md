# Billing unavailable guard + release verification (2026-02-22)

## What happened
- Users saw `Internal Server Error` when clicking `Upgrade to Pro`.
- Root cause: Stripe env vars were missing in Cloudflare Pages production.

## Fix applied
- Billing handlers now return a controlled `503` error with code `billing_unavailable` when Stripe config is missing.
- Billing status now includes `billingEnabled` so UI can disable upgrade/manage actions before users click.
- Account/template UI now shows clear "billing unavailable" messaging instead of surfacing raw internal errors.

## Verification workflow
- Added one-command verification script:
  - `pnpm run verify:release`
- This runs:
  - `pnpm run lint`
  - `pnpm run typecheck`
  - `pnpm run test:run`
  - `pnpm run test:smoke`
