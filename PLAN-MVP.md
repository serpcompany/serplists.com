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
6) Product readiness (auth, entitlements, payments, security, services)  
7) UI alignment (serpui) — **explicitly scheduled last**

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
**Current scripts (serp-checklists)**: `dev`, `dev:api`, `dev:all`, `build`, `build:dev`, `preview`, `lint`, `typecheck`, `test`, `test:run`, and D1 helper scripts (`db:*`), plus `prepare` (lefthook).

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
- [x] Validate `BETTER_AUTH_SECRET`, `R2_PUBLIC_BASE_URL`, and any Vite-exposed variables.
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

### Follow-up: schema + JSON strategy
- [x] Audit legacy `db/schema.sql` vs migrations; remove or realign to avoid drift.
- [x] Confirm JSON storage approach: keep `templates.items` and `checklist_runs.items` as JSON text + retain structured columns (`user_id`, `status`, `is_public`, `slug`, timestamps).
- [x] Add server-side validation (Zod) for templates/runs payloads to prevent invalid JSON in D1.
- [x] Add guardrails for import size/count (warn-only): paid-only import, max 5 templates per import, warn on assets > 5MB.
- [x] Add partial failure reporting for imports (warn-only).

### Template import/export hardening
- [x] Accept minimal JSON templates (title + sections), auto-fill ids/timestamps, and support legacy `items` arrays.
- [x] Export only current user's templates by default; add explicit option to include public templates.
- [x] Preserve public/private flags on import or provide a toggle.
- [x] Warn when imported templates reference R2 assets (no auto-copy yet) and document limitations.

## Phase 4 - Monitoring, SRE, and tests
- [x] Mirror serp-boilerplate hook gates with Lefthook (pre-commit + pre-push).
- [x] Add smoke/e2e test scaffolding (Playwright) if MVP requires it.
- [x] Add Vitest coverage reporting (warn-only).
- [x] Ensure unit tests cover critical flows (auth, templates, runs).
- [x] Add minimal API smoke checks (health, auth, templates).
- [x] Decide on runtime logging/analytics sink (Sentry or equivalent) or explicitly defer for MVP (explicitly deferred; Cloudflare logs only for MVP).

## Phase 5 - Hook migration (Lefthook)
- [x] Remove Husky (`prepare` script) and add Lefthook (`lefthook.yml`).
- [x] Mirror `serp-boilerplate` hook commands with project scripts.
- [x] Ensure `pnpm install` installs hooks (`prepare` script).

## Phase 6 - Product readiness (auth, entitlements, payments, security, services)
### Payments (Stripe)
- **Current**: no Stripe SDK, no billing tables, no webhook endpoint, no entitlements in API/UI.
- [x] Decide billing model (free/pro, trial, usage-based) and plan mapping (Stripe subscriptions; Free+Pro).
- [x] Add Stripe integration: customer + subscription mapping, webhook handler with signature verification, idempotency, and retries.
- [x] Store entitlement state (D1 table or billing cache) and gate API/UI features accordingly (basic template/run limits enforced).
- [x] Add billing entry point in Account settings (manage subscription, invoices).
- [x] Add webhook event log (Stripe event idempotency + debugging).
- [x] Add admin override path for entitlements (manual comp/pro).

### Auth & entitlements hardening
- **Current**: Better Auth cookie sessions (httpOnly); rate limiting is basic; no email verification/reset.
- [x] Decide token storage strategy (httpOnly cookies vs localStorage) and session revocation flow.
- [x] Add rate limiting for `/api/auth/*` and sensitive write endpoints.
- [x] Defer password reset + email verification (not in MVP).
- [x] Define entitlement checks per endpoint (e.g., template limits, export/import limits) (`docs/knowledge/entitlements-enforcement.md`).
- [x] Add logout endpoint + session/token revocation.
- [x] Add change-password endpoint + UI (requires current password).
- [x] Add password policy guardrails (min length + reject common passwords).

### Payload validation & data hygiene
- **Current**: Templates/runs are server-validated (Zod); backup import validation is client-side.
- [x] Add server-side Zod validation for template + run payloads and return consistent 4xx errors.
- [x] Enforce payload size limits for JSON bodies and import files.
- [x] Add schema versioning for template JSON to support future migrations (templates `version` + backup export/import).

### Security & abuse controls
- **Current**: CORS is `*`; uploads only validate size + bucket; public files are key-addressable.
- [x] Decide CORS policy for production (allow-list frontend origin).
- [x] Add server-side MIME/type allowlists per upload bucket.
- [x] Add import guardrails (max templates per import, per-user rate limits).
- [x] Add baseline Cloudflare Pages security headers via `_headers` (CSP/frame/referrer/HSTS).
- [x] Promote critical import limits from warn-only to enforced (max templates/import, max assets size, etc.).

### Services & ops readiness
- **Current**: D1 + R2 only; no documented backup/restore or lifecycle policies.
- [x] Document D1 backup/restore and R2 lifecycle rules (Cloudflare settings).
- [x] Add runbook for incident response (what to check first, where logs live).


## Phase 7 - Misc & things added as we go that dont belong other places

### decide on the feature list & tiers (free, pro)

#### FEATURE LIST

- {num} reusable checklists
- {num} simultaneous/live checklist "runs"
- template import/export
- "add checklist template to account" from the template marketplace
- make username/profile page private

#### Free
- 1 reusable checklist templates in account
- up to 3 checklist runs "live"/"working" at the same time
- (no) template import/export feature
- (no) "add checklist template to account" from the template marketplace
- (no) make username/profile page private


#### Pro
- unlimited reusable checklist templates in account
- unlimited checklist runs "live"/"working" at the same time
- (yes) template import/export feature
- (yes) "add checklist template to account" from the template marketplace
- (yes) make username/profile page private


## MVP acceptance checklist + MISC
- [x] `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:run` all pass.
- [x] `sre:deps` and `sre:dup` produce actionable baseline reports.
- [x] Drizzle schema/migrations established and documented.
- [x] Pre-commit/pre-push hooks run via Lefthook.
- [x] Monitoring/logging approach documented (Cloudflare logs only is acceptable for MVP).
- [x] Billing/entitlements approach documented (even if “not in MVP”).
- [x] clean up the junk templates like "Updated Template Title" and "Test Template" .. debug why there are so many of them created and existing on the homepage and on the /checklists page 
- [x] ensure integration tests reuse a fixed test user to avoid creating new test accounts
- [ ] Env validation in place and enforced in CI/hooks.
- [ ] add markdownlint-cli2 + cspell + lychee to give our documents an opinionated structure and rules to follow and lint against
- [ ] turn on email verification and block login until the address is verified



---

## Phase 8 - POST MVP + NEWBRANCH - UI alignment with serp-boilerplate (serpui) (last)

this phase is about standardizing this project to our other project by using the same build stack (nextjs, ui.shadcn.com, etc.). we need step by step todos for what we need to do in order to convert this projct to nextjs with shadcn while preserving all the urls, logic, db, etc. and just getting it updated to the new tech stack and components

- [ ] Align shadcn style and base color (`new-york` + `neutral`) or document divergence.
- [ ] Update Tailwind/theme tokens to match serpui (as applicable in a Vite app).
- [ ] Audit key screens (Login, Template Editor, Checklist Run) for UI parity.
- [ ] Replace/adjust components where serpui differs (buttons, cards, tabs, etc.).
