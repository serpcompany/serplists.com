# Auth login failures in local dev (429)

## Problem observed
- In local development, repeated calls to `POST /api/auth/sign-in/email` were returning `429 Too Many Requests`.
- This also surfaced as `Unable to establish session`/login regressions when using the Dev login bar or manual sign-in flow.

## Root cause
- API-level rate limiting in `functions/api/[[route]].ts` applies `30 auth requests / 5 minutes` per IP across all auth POST/PUT routes.
- The limit is global by IP and can be hit during active local testing.

## Fix applied
- Kept production behavior unchanged.
- Increased local/dev auth allowance in `functions/api/[[route]].ts`:
  - Local requests (`localhost`, `127.0.0.1`, or port `8788`) now allow `300 requests / hour`.
- This gives headroom for manual login flows and repeated QA testing.
