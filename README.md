# SERP Lists

SERP Lists is a web app for building checklist templates and running checklists with progress tracking. It supports public sharing and user profiles.

## Features
- Create templates with sections, items, and rich content (markdown text, images, videos, files, embeds, sub-tasks)
- Public and private templates with shareable slugs
- Checklist runs with progress tracking
- Public library, category browsing, and user profile pages
- Template import/export (JSON backup)

## Tech stack
- Frontend: React 18, TypeScript, Vite (SWC), Tailwind CSS, shadcn/ui (Radix UI)
- Routing/metadata: React Router, react-helmet-async
- State/data: React Context + TanStack React Query
- Forms/validation: React Hook Form + Zod
- Backend: Cloudflare Pages Functions (TypeScript)
- Data: Cloudflare D1 (SQLite)
- File storage: Cloudflare R2
- Auth: Email/password with bcryptjs + custom JWT

## Quickstart
1. pnpm install
2. Ensure `.dev.vars` has `JWT_SECRET` and `FRONTEND_URL` (see `docs/DEVELOPMENT.md`)
3. pnpm run dev (frontend at http://localhost:8080)
4. pnpm run dev:api (API at http://localhost:8788; run `pnpm run build` if `dist/` is missing)
5. Optional: pnpm run dev:all to run both

## Local database and seed data
- pnpm run db:seed
- pnpm run db:reset

## Dev login (local dummy users)
- In dev, a DevLoginBar and quick-fill buttons appear on the login page.
- Seed users are defined in `db/migrations/seed-test-data.sql`.
- Emails: admin@test.com, john@test.com, jane@test.com, bob@test.com
- Password: password123

## Documentation
- docs/index.md
- docs/ARCHITECTURE.md
- docs/DEVELOPMENT.md
- docs/OPERATIONS.md
- docs/TECH-STACK.md
