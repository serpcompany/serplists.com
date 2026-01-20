# MVP Plan

This plan focuses on stack alignment, quality gates, and operational readiness needed to consider the project MVP-ready. Product scope/features are assumed to be largely in place; adjust scope as needed.

## Goals
- Align tooling and UI standards with `serp-boilerplate` (including serpui styling conventions).
- Introduce stronger quality gates (duplication scans, dependency checks, env validation, hooks).
- Adopt Drizzle for D1 schema and migrations (keep R2/D1 as primary services).
- Improve monitoring, test coverage, and release confidence.

## Non-goals (for now)
- Re-architecture of the entire frontend (unless required for serpui alignment).
- Large feature redesigns outside stack/tooling alignment.

## Dependencies and inputs
- `serp-boilerplate` reference files: `README.md`, `lefthook.yml`, `apps/web/components.json`, `apps/web/src/app/globals.css`, `docs/sections/database.md`.
- Decisions needed on how far to align UI and whether to adopt Next.js patterns in a Vite app.

## Phase 0 - Discovery and alignment baseline
- [ ] Inventory current build, hooks, tests, and lint scripts in `package.json`.
- [ ] Compare with `serp-boilerplate` scripts and list deltas.
- [ ] Review serpui tokens/styles in `serp-boilerplate` (`components.json`, `globals.css`) and capture the UI deltas.
- [ ] Decide which serpui parts to adopt: tokens only, components, or full styling alignment.
- [ ] Supabase + Vercel serverless/Postgres code removed; Cloudflare dev ignore added in .gitignore:1

## Phase 1 - Quality gates and architecture audits
### Dependency-cruiser and jscpd
- [ ] Add `dependency-cruiser` and `jscpd` dev dependencies.
- [ ] Add scripts mirroring serp-boilerplate (`sre:deps`, `sre:dup`).
- [ ] Configure ignore patterns for `dist`, `node_modules`, test artifacts, etc.
- [ ] Run baseline reports and capture actionable findings.
- [ ] Decide enforcement level: warn-only vs pre-commit blocking.

### Optional (from serp-boilerplate)
- [ ] Evaluate adding `react-scan` for render diagnostics (dev-only).
- [ ] Evaluate `secretlint` for secret scanning in hooks.

## Phase 2 - Env validation (t3-oss env)
- [ ] Add `@t3-oss/env-core` (or `@t3-oss/env-nextjs` if applicable) and `zod` schema for env vars.
- [ ] Create separate client/server env schemas for Vite + Pages Functions.
- [ ] Validate `JWT_SECRET`, `R2_PUBLIC_BASE_URL`, and any Vite-exposed variables.
- [ ] Add a `typecheck:env` script and wire it into hooks.

## Phase 3 - Data layer alignment (Drizzle + D1 + R2)
- [ ] Decide migration strategy: replace raw SQL handlers with Drizzle or use Drizzle only for migrations.
- [ ] Add Drizzle schema mirroring existing tables in `db/migrations/*.sql`.
- [ ] Add Drizzle config for D1 (see `serp-boilerplate/apps/web/drizzle.config.ts`).
- [ ] Create migration scripts and a local migration workflow.
- [ ] Update API handlers to use Drizzle queries incrementally (templates, checklists, auth).
- [ ] Keep R2 upload handlers as-is, but align docs and env validation.

## Phase 4 - UI alignment with serp-boilerplate (serpui)
- [ ] Align shadcn style and base color (`new-york` + `neutral`) or document divergence.
- [ ] Update Tailwind/theme tokens to match serpui (as applicable in a Vite app).
- [ ] Audit key screens (Login, Template Editor, Checklist Run) for UI parity.
- [ ] Replace/adjust components where serpui differs (buttons, cards, tabs, etc.).

## Phase 5 - Monitoring, SRE, and tests
- [ ] Mirror serp-boilerplate hook gates with Lefthook (pre-commit + pre-push).
- [ ] Add smoke/e2e test scaffolding (Playwright) if MVP requires it.
- [ ] Ensure unit tests cover critical flows (auth, templates, runs).
- [ ] Add minimal API smoke checks (health, auth, templates).
- [ ] Decide on runtime logging/analytics sink (Sentry or equivalent).

## Phase 6 - Hook migration (Lefthook)
- [ ] Remove Husky (`prepare` script) and add Lefthook (`lefthook.yml`).
- [ ] Mirror `serp-boilerplate` hook commands with project scripts.
- [ ] Ensure `pnpm install` installs hooks (`prepare` script).

## MVP acceptance checklist
- [ ] `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:run` all pass.
- [ ] `sre:deps` and `sre:dup` produce actionable baseline reports.
- [ ] Env validation in place and enforced in CI/hooks.
- [ ] Drizzle schema/migrations established and documented.
- [ ] UI aligned with serpui guidelines (or explicit divergence documented).
- [ ] Pre-commit/pre-push hooks run via Lefthook.
- [ ] Basic monitoring/alerting decision documented and stubbed in code.
