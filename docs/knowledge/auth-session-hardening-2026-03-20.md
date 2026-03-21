# Auth/session hardening notes

## What Better Auth owns

- sign in
- sign up
- sign out
- cookie session lookup
- password change
- revoke other sessions
- password reset
- email verification

## What the app still owns

- route protection and post-login return behavior
- product entitlement checks (`free` vs `pro`)
- upgrade-required and plan-limit messaging
- dev vs production rate-limit choices
- safe failure when supporting services like auth email are unavailable

## Fixes from this pass

- Protected routes now preserve the intended destination so users return to the page they asked for after sign-in.
- Added `GET /api/auth/status` so the frontend can check whether auth email delivery is available.
- `sign-up`, `request-password-reset`, and `send-verification-email` now fail early with explicit `503 auth_email_unavailable` when no email provider is configured.
- Signup and forgot-password pages now surface explicit local/dev messaging instead of generic failure copy when auth email is unavailable.

## Local verification notes

- Local `.dev.vars` currently has no `RESEND_API_KEY` or `USESEND_API_KEY`.
- Because of that, email verification and password reset cannot complete end-to-end locally right now.
- The verified local behavior is that the app fails clearly and safely instead of pretending the flows work.
