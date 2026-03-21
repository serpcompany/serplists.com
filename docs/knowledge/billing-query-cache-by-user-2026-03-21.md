# Billing query cache must be scoped by user (2026-03-21)

## What happened

- In local dev, switching between seeded personas through the dev login bar could show the wrong billing plan on the account page.
- Example: `Jane (Pro)` could render `Current plan: Free` even though the backend entitlement response for `jane@test.com` was `pro`.

## Root cause

- Several UI surfaces were reading billing status through React Query with the shared key `["billing", "status"]`.
- When the logged-in user changed, React Query could reuse the prior user's cached billing response because the key did not include the user identity.
- Some UI labels also defaulted to `Free` while the billing query was still loading, which made the wrong plan flash briefly even when the backend response was correct.

## Fix

- Add a shared helper in `src/lib/billing.ts`:
  - `getBillingStatusQueryKey(userId)`
- Use that helper anywhere the UI fetches billing status so the key becomes:
  - `["billing", "status", userId]`
  - or `["billing", "status", "guest"]` when no user exists
- Do not render a paid/free label as if it were known while the billing query is still unresolved. Show a neutral loading state instead.

## Surfaces updated

- Account billing section
- Template backup/import card
- Public template copy gating
- Template detail copy gating

## Verification

- Confirm `admin@test.com` returns `plan: "pro"` from `GET /api/billing/status`
- Switch personas in dev mode
- Reopen the account/template surfaces
- Confirm the displayed plan matches the backend response for the current user
