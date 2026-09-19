# Frontend Admin Module

Authentication and account settings for the web app.

## Related files
- `src/contexts/CloudflareAuthContext.tsx` - Auth state and login/register logic
- `src/contexts/WorkspaceContext.tsx` - Personal/Organization context state after auth; filename is legacy
- `src/pages/Login.tsx` - Login UI (dev quick-fill buttons)
- `src/pages/Register.tsx` - Registration UI
- `src/pages/DashboardSettings.tsx` - Current Account, billing, and Organization settings UI
- `src/pages/TeamInviteAccept.tsx` - Link-based Organization invite acceptance; filename is legacy
- `src/components/DevLoginBar.tsx` - Dev-only quick login bar
- `functions/api/handlers/auth.ts` - Auth and profile endpoints
- `functions/api/handlers/teams.ts` - Organization, invite, and activity endpoints under legacy API identifiers
- `functions/api/utils/session.ts` - Better Auth session lookup

## Current scope
- Email/password auth (Better Auth)
- Profile update: `name`, `username`, `avatar_url`
- Public profile lookup by username or user ID
- Session is cookie-based (httpOnly). Logout is handled by Better Auth.
- Change password + revoke other sessions are available via Better Auth.
- Settings/account route: `/dashboard/settings`
- Incoming Organization invites are visible from `/dashboard/settings`.

## API surface

The `/api/teams` route family below is a legacy implementation name for Organization operations.
- Better Auth endpoints are served under `/api/auth/*` (e.g. `POST /api/auth/sign-in/email`, `POST /api/auth/sign-up/email`).
- `GET /api/profiles/by-username?username=...`
- `GET /api/profiles/by-id?userId=...`
- `GET /api/teams`
- `GET /api/teams/invites/pending`
- `POST /api/teams/invites/pending/:inviteId/accept`
- `POST /api/teams/invites/:token/accept`

## Route protection
`src/App.tsx` wraps authenticated dashboard routes with `src/components/RequireAuth.tsx`. Legacy `/account` and `/dashboard/profile` routes redirect to `/dashboard/settings`.
