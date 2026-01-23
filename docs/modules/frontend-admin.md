# Frontend Admin Module

Authentication and account settings for the web app.

## Related files
- `src/contexts/CloudflareAuthContext.tsx` - Auth state and login/register logic
- `src/pages/Login.tsx` - Login UI (dev quick-fill buttons)
- `src/pages/Register.tsx` - Registration UI
- `src/pages/Account.tsx` - Profile settings UI
- `src/components/DevLoginBar.tsx` - Dev-only quick login bar
- `functions/api/handlers/auth.ts` - Auth and profile endpoints
- `functions/api/utils/jwt.ts` - JWT signing/verifying

## Current scope
- Email/password auth (Better Auth)
- Profile update: `name`, `username`, `avatar_url`
- Public profile lookup by username or user ID
- Session is cookie-based (httpOnly). Logout is handled by Better Auth.
- Change password + revoke other sessions are available via Better Auth.

## API surface
- Better Auth endpoints are served under `/api/auth/*` (e.g. `POST /api/auth/sign-in/email`, `POST /api/auth/sign-up/email`).
- `GET /api/profiles/by-username?username=...`
- `GET /api/profiles/by-id?userId=...`

## Route protection
`src/App.tsx` uses a `PrivateRoute` wrapper for authenticated pages. `src/components/RequireAuth.tsx` exists for nested routing but is not currently wired into the router.
