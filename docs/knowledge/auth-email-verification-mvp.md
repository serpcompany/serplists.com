# Auth Email Verification (MVP Lock)

## What changed
- Email verification is required before sign-in.
- Sign-up sends verification email.
- Login handles unverified-email errors and supports resend verification.
- Password reset and verification emails both use the same Resend-backed delivery path.

## Required env
- `BETTER_AUTH_SECRET` (or legacy `JWT_SECRET`, 32+ chars)
- `RESEND_API_KEY` or `USESEND_API_KEY`
- `EMAIL_FROM` (optional; defaults to `noreply@mail.auth.serp.co`)

Use `.dev.vars` as the single local env file.

## Verification checklist (production)
1. Create a new account from `/register`.
2. Confirm UI redirects to `/login` with verify-email prompt.
3. Confirm verification email is received and link opens.
4. Confirm `/login` succeeds only after verification.
5. Trigger `/forgot-password`, confirm reset email arrives.
6. Complete reset link flow and verify sign-in with the new password.

## Regression coverage
- `tests/unit/functions/api/better-auth-config.test.ts`
  - `requireEmailVerification` is enabled.
  - verification email sender is wired.
  - password reset email sender is wired.
- `tests/integration/api.workerless.test.ts`
  - production test-email blocking includes Better Auth endpoints:
    - `/api/auth/sign-up/email`
    - `/api/auth/sign-in/email`
