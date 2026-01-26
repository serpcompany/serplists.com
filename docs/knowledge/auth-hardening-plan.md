# Auth Hardening Plan (MVP)

## Goals
- Keep auth cookie-based (httpOnly) with Better Auth.
- Ensure security defaults stay on (CSRF/origin checks).
- Keep UX simple: sign in/up, sign out, change password, revoke other sessions.

## Current state (implemented)
- Better Auth mounted at `/api/auth/*` with httpOnly cookies.
- Password change UI in Account settings; can revoke other sessions.
- Basic rate limiting in `functions/api/[[route]].ts` for `/api/auth/*` and write endpoints.
- CORS supports cookie auth in local dev by reflecting `Origin` and setting `Access-Control-Allow-Credentials: true`.

## MVP decisions
- **Password reset:** Enabled via Better Auth + Resend (`/forgot-password` + `/reset-password`).
- **Email verification:** Not in MVP (password-based only).
  - Implication: accounts are created immediately; we rely on rate limiting + password policy + Better Auth cookie security.

## CSRF / origin review (what we rely on)
- Better Auth CSRF/origin protections remain enabled (do not set `advanced.disableCSRFCheck` or `advanced.disableOriginCheck`).
- `trustedOrigins` must include the frontend origin(s) (prod) and local dev origins (already configured).
- Production CORS must be allowlisted via `FRONTEND_URL`/`CORS_ALLOWED_ORIGINS` (avoid wildcard origins in prod when using cookies).

## Session UX plan
- Keep current “Security” section:
  - Change password (optionally revoke other sessions)
  - One-click “sign out other sessions”
- Optional post-MVP: show active sessions/devices.
  - Note: this likely requires Better Auth `multiSession` plugin for “device session list” UX.

## Post-MVP options
- Enable `emailAndPassword.requireEmailVerification`.
- Add “Verify email” / “Resend verification” flow.
