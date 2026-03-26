# Auth and entitlement UI contract (2026-03-20)

## Why this changed

- The backend was already returning structured API errors such as:
  - `401 Unauthorized`
  - `403 upgrade_required`
  - `403 limit_reached`
  - `503 billing_unavailable`
- The browser client was flattening those into plain `Error.message`, so the UI was guessing intent by checking strings like `"upgrade"` or `"limit"`.

## What changed

- `src/lib/api.ts` now throws a typed `ApiError` that preserves:
  - `status`
  - `code`
  - `details`
  - `message`
- Shared helpers now handle the common access outcomes:
  - unauthenticated -> send user to `/login` with the original return path preserved
  - upgrade required / plan limit -> start billing checkout
  - billing unavailable -> show explicit billing-unavailable message
  - anything else -> show the actual error message

## Surfaces normalized

- Public template copy on `/profile/{username}/{templateSlug}`
- Console template detail copy/open flows under `/console/templates/{id}`
- Template import/export in account backup UI
- Shared login redirect behavior from protected routes and manual action prompts

## Verification run

- Protected route:
  - open `/console/templates` while logged out
  - redirect to `/login`
  - sign in as `john@test.com`
  - return to `/console/templates`
- Public template copy:
  - guest sees `Log in to copy template`
  - guest login returns to the same `/profile/devinschumacher/content-refresh-checklist` URL
  - `john@test.com` sees `Upgrade to copy template`
  - clicking it redirects to Stripe Checkout
- Pro copy:
  - `admin@test.com` sees `Copy to My Templates`
  - clicking it returns to `/console/templates`
