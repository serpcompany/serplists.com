# Documentation TODO

- [x] Refresh core docs (README, docs/index, architecture, development, operations, tech stack)
- [x] Refresh reference docs (quick-reference, file-inventory, modules, patterns, recipes, schema, enhancements)
- [x] Add MVP planning doc (`PLAN-MVP.md`)
- [x] Clean up database structure (move migrations/schema into `db/` and update references)
- [ ] Review jscpd duplicate-code findings (API handlers + UI pages) and decide on refactors
- [x] Add env validation with `@t3-oss/env-core` (Vite + Pages Functions)
- [x] Add `pnpm run typecheck:env` for `.dev.vars` validation
- [x] Add Drizzle schema/config + scripts (`db/schema/index.ts`, `db/drizzle.config.ts`, `db:generate`, `db:migrate`)
- [x] Move Pages Functions queries to Drizzle ORM (auth, templates, checklists)
- [x] Update auth unit tests to mock Drizzle DB access
- [x] Reorganize Drizzle schema/types into folders (`db/schema/`, `db/types/`)
- [x] Remove legacy Hono worker (`src/api`) and related tests/dependencies
- [x] Add Playwright smoke/e2e scaffolding and scripts
- [x] Add `/api/health` endpoint with integration coverage
