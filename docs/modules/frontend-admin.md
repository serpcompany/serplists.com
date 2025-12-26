# Frontend Admin Module

Authentication + account settings surfaces for the web app.

**Related Files**
- `/src/contexts/CloudflareAuthContext.tsx` - Client auth state (JWT stored in `localStorage`)
- `/src/pages/Login.tsx` - Login UI
- `/src/pages/Register.tsx` - Registration UI
- `/src/pages/Account.tsx` - Account settings (profile)
- `/src/components/RequireAuth.tsx` - Client-side route protection
- `/src/components/account/ProfileSection.tsx` - Profile form UI
- `/functions/api/handlers/auth.ts` - Auth/profile endpoints
- `/functions/api/utils/jwt.ts` - JWT signing/verifying

## Current scope

- Email/password auth (register/login/logout).
- Account settings: update profile (`name`, `username`, `avatar_url`).
- Public profiles (lookup by username/id).
- No OAuth, no magic link, no billing/subscriptions, no affiliate.

## API surface (auth/profile)

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/profile`
- `PUT /api/auth/profile`
- `GET /api/profiles/by-username?username=...`
- `GET /api/profiles/by-id?userId=...`

## Client-side guard

Routes that require auth are wrapped by `/src/components/RequireAuth.tsx`, which redirects unauthenticated users to `/login`.
