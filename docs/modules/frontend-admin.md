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
- Email/password auth (register and login)
- Profile update: `name`, `username`, `avatar_url`
- Public profile lookup by username or user ID
- Logout is client-only (clears `auth_token` from localStorage)

## API surface
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/profile`
- `PUT /api/auth/profile`
- `GET /api/profiles/by-username?username=...`
- `GET /api/profiles/by-id?userId=...`

## Route protection
`src/App.tsx` uses a `PrivateRoute` wrapper for authenticated pages. `src/components/RequireAuth.tsx` exists for nested routing but is not currently wired into the router.
