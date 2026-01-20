# Quick Reference

## Common scripts
```bash
pnpm run dev
pnpm run dev:api
pnpm run dev:all
pnpm run build
pnpm run preview
pnpm run test
pnpm run test:run
pnpm run typecheck
pnpm run typecheck:env
pnpm run lint
pnpm run sre:dup
pnpm run sre:deps
```

## Database (local D1)
```bash
pnpm run db:seed
pnpm run db:reset
pnpm run db:generate
pnpm run db:migrate
pnpm run db:query "SELECT * FROM templates LIMIT 5"
```

## Ports and base URLs
- Frontend (Vite): http://localhost:8080
- API (Pages Functions dev): http://localhost:8788
- API base: `http://localhost:8788/api` in dev, `/api` in production

## Core API routes
- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET|PUT /api/auth/profile`
- Public profiles: `GET /api/profiles/by-username`, `GET /api/profiles/by-id`
- Templates: `GET /api/templates`, `GET /api/templates/:id`, `GET /api/templates/slug/:slug`, `GET /api/templates/public?userId=...`, `POST /api/templates`, `PUT|DELETE /api/templates/:id`
- Runs: `GET /api/checklists`, `GET /api/checklists/:id`, `POST /api/checklists`, `PUT|DELETE /api/checklists/:id`
- Uploads: `POST /api/uploads`, `GET|HEAD|DELETE /api/uploads/file?key=...`

## Dev login (dummy users)
- Visible only in dev mode.
- Seed users via `pnpm run db:seed` or `pnpm run db:reset`.
- Emails: admin@test.com, john@test.com, jane@test.com, bob@test.com
- Password: password123
