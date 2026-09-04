# Quick Reference

## Common scripts
```bash
pnpm run dev
pnpm run dev:api
pnpm run dev:all
pnpm run dev:auto
pnpm run build
pnpm run build:dev
pnpm run preview
pnpm run test
pnpm run test:run
pnpm run test:unit
pnpm run test:coverage
pnpm run test:smoke
pnpm run test:e2e
pnpm run test:e2e:ui
pnpm run typecheck
pnpm run typecheck:env
pnpm run lint
pnpm run secret:scan
pnpm run verify:release
pnpm run sre:dup
pnpm run sre:deps
```

## Database (local D1)
```bash
pnpm run db:migrations:list:local
pnpm run db:migrate:d1:local
pnpm run db:seed
pnpm run db:reset
pnpm run db:reset:test-user-passwords
pnpm run db:generate
pnpm run db:migrate
pnpm run db:query "SELECT * FROM templates LIMIT 5"
```

## Database (remote D1)
```bash
# Preview/staging readiness, non-destructive
pnpm run verify:staging
pnpm run check:preview:d1-binding
pnpm run db:migrations:list:staging
pnpm run db:migrate:d1:staging
pnpm run db:seed:official:staging
pnpm run check:staging:d1-schema

# Production readiness, non-destructive
pnpm run verify:prod:d1
pnpm run db:migrations:list:prod

# One-time only if prod predates native D1 migration tracking:
pnpm run db:migrations:baseline:prod -- --through 0020 --execute
pnpm run db:migrate:d1:prod
pnpm run check:prod:d1-schema
```

## Ports and base URLs
- Frontend (Vite): http://localhost:8080
- API (Pages Functions dev): http://localhost:8788
- API base: `http://localhost:8788/api` in dev, `/api` in production
- Settings/account: `/dashboard/settings`
- Team invite links: `/team-invites/:token`

## Core API routes
- Auth (Better Auth): `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`
- Public profiles: `GET /api/profiles/by-username`, `GET /api/profiles/by-id`
- Templates: `GET /api/templates`, `GET /api/templates/:id`, `GET /api/templates/slug/:slug`, `GET /api/templates/public?userId=...`, `POST /api/templates`, `PUT|DELETE /api/templates/:id`
- Runs: `GET /api/checklists`, `GET /api/checklists/:id`, `POST /api/checklists`, `PUT|DELETE /api/checklists/:id`
- Teams: `GET|POST /api/teams`, `GET|PUT /api/teams/:teamId`, `GET /api/teams/:teamId/members`, `PUT /api/teams/:teamId/members/:memberId`, `PUT /api/teams/:teamId/owner`
- Team invites: `GET|POST /api/teams/:teamId/invites`, `DELETE /api/teams/:teamId/invites/:inviteId`, `GET /api/teams/invites/pending`, `POST /api/teams/invites/pending/:inviteId/accept`, `POST /api/teams/invites/:token/accept`
- Team activity: `GET /api/teams/:teamId/activity`
- Uploads: `POST /api/uploads`, `GET|HEAD|DELETE /api/uploads/file?key=...`

Template and run APIs accept `teamId` where workspace scoping is supported.

Run responses include `template_version`, `current_template_version`, `revision`, and derived `is_stale`. Send `expected_revision` when updating a run and `expected_version` when updating a template. Reconcile and reopen a completed private run with `POST /api/checklists/:id/revalidate`.

## Dev login (dummy users)
- Visible only in dev mode.
- Seed users via `pnpm run db:seed` or `pnpm run db:reset`.
- Emails: checklists@serp.co, admin@test.com, john@test.com, jane@test.com, bob@test.com
- Default password: `password123`
- Restore changed local test-user passwords: `pnpm run db:reset:test-user-passwords`

## Team-focused tests
```bash
pnpm run test:run -- tests/unit/functions/api/teams-handler.test.ts
pnpm run test:run -- tests/unit/components/TeamSettingsSection.test.tsx
pnpm run test:e2e -- tests/e2e/team-workspace.spec.ts
pnpm run test:e2e -- tests/e2e/team-invite-flow.spec.ts
```
