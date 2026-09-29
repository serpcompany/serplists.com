# AGENTS

SERP Lists lets people and Organizations own reusable templates and execute them
as runs. React SPA (`src/`) + Cloudflare Pages Functions API (`functions/`) + D1.
This file is a map: read the linked source of truth before changing an area.

Using `rg` crashes VS Code because it spawns hundreds of processes. DO NOT USE IT.
Use `grep`/`find` instead.

## Where knowledge lives

| Need | Read |
| --- | --- |
| Domains, layers, enforced dependency rules, stack | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Product principles and vocabulary (Personal, Organization, Template, Run) | [docs/PRODUCT_SENSE.md](docs/PRODUCT_SENSE.md) |
| What the product does today | [docs/product-specs/](docs/product-specs/index.md) |
| Rules every change follows, and what enforces them | [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md) |
| How each subsystem works (auth, Organizations, billing, data, dev environment) | [docs/design-docs/](docs/design-docs/index.md) |
| Frontend conventions and UI design | [docs/FRONTEND.md](docs/FRONTEND.md), [docs/DESIGN.md](docs/DESIGN.md) |
| CI, deploys, observability, incidents, testing | [docs/RELIABILITY.md](docs/RELIABILITY.md) |
| Auth model, secrets, CORS, rate limits | [docs/SECURITY.md](docs/SECURITY.md) |
| Plans, progress, and known debt | [docs/PLANS.md](docs/PLANS.md) |
| Quality grade per domain | [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md) |
| Current database tables (generated) | [docs/generated/db-schema.md](docs/generated/db-schema.md) |
| Third-party docs for our pinned versions | [docs/references/](docs/references/) |

## Commands

```bash
pnpm install && pnpm run setup   # fresh clone or worktree: .dev.vars, local D1, browser, dist/
pnpm run dev:all                 # app + API on a free port pair; logs in tmp/logs/dev-all.log
pnpm run dev:stop                # stop them, including child processes (use this, not a kill)
pnpm run ui:snap -- dashboard --login john@test.com   # screenshot + accessibility tree
pnpm run verify                  # the pre-PR gate: env, lint, types, repo checks, unit tests
pnpm run test:smoke              # browser smoke tests on an isolated local stack
pnpm run test:e2e:full           # full browser suite (required for promotions to main)
```

Details: [development environment](docs/design-docs/development-environment.md).

## Definition of done

1. `pnpm run verify` passes. CI runs the same checks plus build, D1 integration,
   browser tests, and schema parity.
2. UI changes: attach `pnpm run ui:snap` output or a screenshot to the PR as evidence.
3. Behavior changes update the docs that describe them (`pnpm run docs:check` keeps
   links and paths honest, not content).
4. Multi-step work has an exec plan in `docs/exec-plans/active/` with progress and a
   decision log ([PLANS.md](docs/PLANS.md)); shortcuts go in the tech debt tracker.
5. The PR template is filled in, the PR is small enough to review quickly, and every
   review comment (Claude's and humans') is fixed or answered.

## Working rules

- Follow [core beliefs](docs/design-docs/core-beliefs.md). Lint and dependency
  errors include the fix; read the message before changing code.
- Never add entries to `eslint-suppressions.json`,
  `.dependency-cruiser-known-violations.json`, or the file-size caps in
  `eslint.config.js` to make a change pass. Those files only shrink.
- Parse external data with Zod at the boundary; do not guess shapes.
- API code logs with `log()` from `functions/api/utils/logger.ts`, never personal data.
- User-visible text uses [PRODUCT_SENSE.md](docs/PRODUCT_SENSE.md) terms (Organization, not Team or Workspace).
- When you hit the same problem twice, fix the harness: add the missing doc, check,
  or script, in the same PR or as a follow-up issue.

## Escalate to a human

Stop and ask before: applying migrations or running writes against staging or
production D1; anything touching live Stripe keys or billing state; deleting user
data; changing product wording or pricing; changing a rule in the core beliefs.

## Git flow

- `main` is the production branch.
- `staging` is the primary integration branch for active development.
- New implementation work should happen on short-lived issue/task branches created from `staging` unless there is an explicit reason to branch from somewhere else.
- Finished issue/task branches should merge into `staging` first.
- Only promote changes from `staging` into `main` when they are ready for production.

## Database changes

- Read [database operations](docs/design-docs/database-operations.md) before changing the Drizzle schema, D1 migrations, or SQL-only database objects.
- D1 bills rows scanned, not rows returned: follow the query rules in [D1 cost](docs/design-docs/d1-cost.md) and check new or changed queries with `pnpm run d1:profile`.
- Run `pnpm run check:db:drizzle-parity` and `pnpm run db:schema:generate` after changing any of them (CI checks both).
- Do not apply or commit the baseline currently proposed by `pnpm run db:generate`; Drizzle snapshot initialization is tracked separately.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
