# MVP Plan

This plan focuses on stack alignment, quality gates, and operational readiness needed to consider the project MVP-ready. Product scope/features are assumed to be largely in place; adjust scope as needed.

## Goals
- Align tooling and UI standards with `serp-boilerplate` (including serpui styling conventions).
- Introduce stronger quality gates (duplication scans, dependency checks, env validation, hooks).
- Adopt Drizzle for D1 schema and migrations (keep R2/D1 as primary services).
- Improve monitoring, test coverage, and release confidence.

## Execution order (updated)
1) Quality gates & tooling  
2) Env validation  
3) Data layer alignment  
4) Monitoring/SRE & tests  
5) Hook migration (Lefthook)  
6) UI alignment (serpui) — **explicitly scheduled last**

## Non-goals (for now)
- Re-architecture of the entire frontend (unless required for serpui alignment).
- Large feature redesigns outside stack/tooling alignment.

## Dependencies and inputs
- `serp-boilerplate` reference files: `README.md`, `lefthook.yml`, `apps/web/components.json`, `apps/web/src/app/globals.css`, `docs/sections/database.md`.
- Decisions needed on how far to align UI and whether to adopt Next.js patterns in a Vite app.

## Phase 0 - Discovery and alignment baseline
- [x] Inventory current build, hooks, tests, and lint scripts in `package.json`.
- [x] Compare with `serp-boilerplate` scripts and list deltas.
- [x] Review serpui tokens/styles in `serp-boilerplate` (`components.json`, `globals.css`) and capture the UI deltas.
- [ ] Decide which serpui parts to adopt: tokens only, components, or full styling alignment.
- [x] Supabase + Vercel serverless/Postgres code removed; Cloudflare dev ignore added in .gitignore:1

### Phase 0 findings
**Current scripts (serp-checklists)**: `dev`, `dev:api`, `dev:all`, `build`, `build:dev`, `preview`, `lint`, `typecheck`, `test`, `test:run`, and D1 helper scripts (`db:*`), plus `prepare` (husky).

**Delta vs serp-boilerplate**:
- Missing: `start`, `test:unit`, `test:smoke`, `test:e2e`, `test:e2e:ui`, `secret:scan`, `sre:dup`, `sre:deps`, `sre:react-scan`, and `lefthook`-based `prepare`.
- Unique here: `dev:api`, `dev:all`, `build:dev`, and the D1 helper scripts (`db:*`).

**Serpui/UI deltas**:
- `components.json`: `style: "default"` + `baseColor: "slate"` (here) vs `style: "new-york"` + `baseColor: "neutral"` (serp-boilerplate).
- Tailwind: v3 config + `src/index.css` tokens (here) vs Tailwind v4 + `src/app/globals.css` tokens (serp-boilerplate).
- Tokens: current palette is purple-forward; serpui is neutral-forward with new-york shadcn defaults.

## Phase 1 - Quality gates and architecture audits (first)
### Dependency-cruiser and jscpd
- [x] Add `dependency-cruiser` and `jscpd` dev dependencies.
- [x] Add scripts mirroring serp-boilerplate (`sre:deps`, `sre:dup`).
- [x] Configure ignore patterns for `dist`, `node_modules`, test artifacts, etc.
- [x] Run baseline reports and capture actionable findings.
- [x] Decide enforcement level: warn-only vs pre-commit blocking.

**Baseline results (latest run)**:
- `sre:deps`: no dependency violations.
- `sre:dup`: 33 clones (mostly in API handlers and UI pages); see `docs/TODO.md`.

### Optional (from serp-boilerplate)
- [ ] Evaluate adding `react-scan` for render diagnostics (dev-only).
- [ ] Evaluate `secretlint` for secret scanning in hooks.

## Phase 2 - Env validation (second)
- [x] Add `@t3-oss/env-core` (or `@t3-oss/env-nextjs` if applicable) and `zod` schema for env vars.
- [x] Create separate client/server env schemas for Vite + Pages Functions.
- [x] Validate `JWT_SECRET`, `R2_PUBLIC_BASE_URL`, and any Vite-exposed variables.
- [x] Add a `typecheck:env` script (hook wiring will be done in Phase 5).

## Phase 3 - Data layer alignment (third)
### Plan
- [x] Decide migration strategy: use Drizzle for runtime queries and add Drizzle Kit config; keep SQL migrations as source of truth for now.
- [x] Add Drizzle schema mirroring existing tables in `db/migrations/*.sql`.
- [x] Add Drizzle D1 client wrapper for Pages Functions.
- [x] Update API handlers to use Drizzle queries (auth, templates, checklists).
- [x] Add Drizzle Kit config and scripts (`db:generate`, `db:migrate`).
- [x] Update docs to reflect Drizzle usage.
- [x] Keep R2 upload handlers as-is.

## Phase 4 - Monitoring, SRE, and tests
- [ ] Mirror serp-boilerplate hook gates with Lefthook (pre-commit + pre-push).
- [x] Add smoke/e2e test scaffolding (Playwright) if MVP requires it.
- [ ] Ensure unit tests cover critical flows (auth, templates, runs).
- [x] Add minimal API smoke checks (health, auth, templates).
- [ ] Decide on runtime logging/analytics sink (Sentry or equivalent).

## Phase 5 - Hook migration (Lefthook)
- [ ] Remove Husky (`prepare` script) and add Lefthook (`lefthook.yml`).
- [ ] Mirror `serp-boilerplate` hook commands with project scripts.
- [ ] Ensure `pnpm install` installs hooks (`prepare` script).

## Phase 6 - UI alignment with serp-boilerplate (serpui) (last)
- [ ] Align shadcn style and base color (`new-york` + `neutral`) or document divergence.
- [ ] Update Tailwind/theme tokens to match serpui (as applicable in a Vite app).
- [ ] Audit key screens (Login, Template Editor, Checklist Run) for UI parity.
- [ ] Replace/adjust components where serpui differs (buttons, cards, tabs, etc.).

## MVP acceptance checklist
- [ ] `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:run` all pass.
- [ ] `sre:deps` and `sre:dup` produce actionable baseline reports.
- [ ] Env validation in place and enforced in CI/hooks.
- [ ] Drizzle schema/migrations established and documented.
- [ ] UI aligned with serpui guidelines (or explicit divergence documented).
- [ ] Pre-commit/pre-push hooks run via Lefthook.
- [ ] Basic monitoring/alerting decision documented and stubbed in code.
