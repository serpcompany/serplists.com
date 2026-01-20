# Tech Stack

This document lists the current stack as implemented in the repository. Sources of truth: `package.json`, `vite.config.ts`, `wrangler.toml`, `functions/api`, and `src/`.

## Frontend
- React 18 + TypeScript
- Vite + `@vitejs/plugin-react-swc`
- Tailwind CSS + `tailwindcss-animate` + `@tailwindcss/typography`
- shadcn/ui (Radix UI primitives)
- `react-router-dom` for routing
- `react-helmet-async` for document metadata
- `sonner` for toast notifications
- `react-markdown` + `remark-gfm` for markdown rendering
- `lucide-react` for icons

## State and data
- React Context for auth and templates
- TanStack React Query for server state and caching

## Forms and validation
- React Hook Form + `@hookform/resolvers`
- Zod schemas in `src/lib/schemas/checklistSchema.ts`

## API and backend
- Cloudflare Pages Functions in `functions/api`
- Custom request router in `functions/api/[[route]].ts`
- Custom JWT signing/verification in `functions/api/utils/jwt.ts`
- `bcryptjs` for password hashing

## Storage and services
- Cloudflare D1 (SQLite) for application data
- Cloudflare R2 for uploads (`R2_UPLOADS` binding)

## Tooling and testing
- pnpm
- ESLint (flat config)
- Vitest + React Testing Library
- Wrangler for Pages/D1 local dev and deploy
- `concurrently` for `pnpm run dev:all`
- `lovable-tagger` for dev-time component tagging in Vite

## Legacy or unused code
- `src/api/` contains a Hono-based worker that is not wired into the build.
- `src/lib/api/client.ts` is not referenced by current app code.
- `db/schema.sql` is a legacy snapshot; migrations in `db/migrations/` are the source of truth.
