# Reliability

How changes are verified, shipped, observed, and recovered. Database environments,
migrations, backups, and R2 storage are in
[design-docs/database-operations.md](design-docs/database-operations.md).

## Principles

- Every check runs in CI, and nothing deploys unless every check passes.
- Deploys fail closed: pending D1 migrations or a failed probe of the new
  deployment stop the release.
- Preview deployments never touch production data.
- Schema changes go through Wrangler migrations only, never ad hoc remote SQL.
- If an incident starts right after a deploy, roll back first and debug second.

## Quality gates

| Where | What runs |
| --- | --- |
| Pre-commit hook | Secret scan and ESLint on staged files |
| Pre-push hook | `pnpm run verify` |
| `pnpm run verify` | Env contract, lint, `tsc -b`, `check:repo` (secrets, docs, architecture, generated artifacts), unit tests |
| CI Quality Gate | `verify` steps plus local D1 fixture tests, build, and browser tests: smoke on every PR, the full suite on PRs into `main` |
| CI schema parity | Replays every migration and compares it with the Drizzle schema |
| Claude code review | Advisory inline review comments on every non-draft PR; never blocks merging ([agent workflow](design-docs/agent-workflow.md#claude-code-review)) |
| Before a release | `pnpm run verify:release` locally; `pnpm run verify:staging` or `pnpm run verify:prod:d1` for remote D1 readiness (needs Cloudflare credentials) |

Lefthook hooks install with `pnpm install` (the `prepare` script); run
`pnpm exec lefthook install` if they are missing. When a CI failure looks flaky,
re-run once. If it fails again, treat it as real, and record genuinely flaky tests
in the [tech debt tracker](exec-plans/tech-debt-tracker.md).

## Deploy pipeline

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` and
`staging`. On pushes (or a manual run with "deploy" checked), its deploy job calls
the reusable `.github/workflows/cloudflare-pages-deploy.yml` after both check jobs
pass. The deploy workflow:

1. validates the env contract with a placeholder `BETTER_AUTH_SECRET` (the real
   secret lives only in Cloudflare Pages)
2. blocks on pending D1 migrations: `pnpm run verify:prod:d1` for `main`,
   `pnpm run verify:staging` for other branches
3. builds with full git history (`fetch-depth: 0`), because sitemap `lastmod`
   values come from `git log`; a shallow clone would stamp every page with the
   deploy date
4. runs `wrangler pages deploy ./dist --branch <branch>`
5. probes the new deployment's `/api/health` (the Worker boots) and
   `/api/templates` (D1 is bound). A 5xx or no response fails the run; other
   statuses, such as an access policy, only warn

Cloudflare Pages settings:

- Project name `serplists-com`, set directly in the workflow. Do not use the
  `serp-checklists.pages.dev` domain or the `wrangler.toml` `name` as the project name.
- Domains: `serp-checklists.pages.dev`, `serplists.com`, `staging.serplists.com`.
- GitHub secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_API_KEY`.
  The workflow uses email plus global key because the repo's legacy
  `CLOUDFLARE_API_TOKEN` could not read the Pages project.
- `main` deploys use production D1 (`serp-checklists-db`); `staging` and preview
  deploys use `serp-checklists-staging-db` through the preview binding.
- Keep `actions/checkout` and `actions/setup-node` on v5 or newer. Node is pinned
  to 22 in both workflows.

To deploy by hand (rarely needed): `pnpm run build`, then
`npx wrangler pages deploy ./dist --project-name serplists-com`.

## Observability

- API logs are JSON lines from `log()` in `functions/api/utils/logger.ts`. Every
  request gets a `requestId`, returned as the `X-Request-Id` header. ESLint rejects
  direct `console.*` in `functions/`. Log ids, never emails or tokens.
- The router logs each request's path through `sanitizeLogPath()`
  (`functions/api/utils/log-path.ts`), which replaces the secrets some routes carry
  in the URL with `:token`: `auth/reset-password/<token>`,
  `checklists/shared/<shareToken>` and `teams/invites/<token>/accept`. Add any new
  route with a secret in its path there. Cloudflare's own request metadata still
  records the full URL, so limit who can read the runtime logs.
- Production: Cloudflare runtime logs for the Pages project. There is no external
  log sink, metrics, traces, or alerting yet.
- Local: `pnpm run dev:all` mirrors output to `tmp/logs/dev-all.log`; search for
  `"level":"error"` or a request id.
- Frontend: `ErrorBoundary` and analytics (`src/lib/analytics.ts`, in-memory)
  write to the browser console only.
- Weekly maintenance (`.github/workflows/maintenance.yml`): a Claude doc-gardening
  agent opens a PR fixing docs that drifted from the code, and a report of recorded
  debt is posted as an issue (`pnpm run maintenance:report`).

## Incident response

Fast triage (5 minutes):

1. Decide whether the problem is frontend-only or API-only; `GET /api/health`
   confirms the Functions respond.
2. Check the Cloudflare runtime logs and collect `X-Request-Id` values from
   failing responses.
3. If the incident started right after a deploy, roll back to the previous Pages
   deployment first.

Common failures:

- **Login loops or 401s:** confirm requests send cookies (`credentials: "include"`)
  and CORS allows credentials for the right origin (`FRONTEND_URL`,
  `CORS_ALLOWED_ORIGINS`). Rotating `BETTER_AUTH_SECRET` invalidates all sessions.
- **All `/api/*` return Cloudflare 1101:** the auth secret is missing or under 32
  characters, or a URL setting is malformed. Validate with `pnpm run typecheck:env`.
- **500s on templates or runs:** check recent migrations and deploys. For recovery,
  prefer D1 Time Travel (see [database operations](design-docs/database-operations.md)).
- **Uploads failing or 404:** confirm the `R2_UPLOADS` binding and bucket name, that
  the requested key exists, and that no lifecycle rule is expiring objects.

## Testing conventions

- Run the smallest relevant test while developing; run `pnpm run verify` before a PR.
- Smoke and e2e suites run against local workers or dedicated staging, never
  production. They use an isolated stack: frontend `localhost:4173`, API
  `localhost:8788`, and D1 state in `.wrangler/smoke-state`. Keep both on the
  `localhost` host name; mixing `127.0.0.1` drops `SameSite=Lax` cookies.
- e2e specs share one database, so `test:e2e:full` runs with one worker (TD-11).
- Reuse stable test identities instead of registering a new account on every run.
  Production auth blocks known test-email domains; keep that coverage when auth
  routes change.
- Handler tests assert the public contract, not incidental query order. Request
  the legacy template backup explicitly with `?format=backup`; the default export
  is portable.
- Pages Function unit tests mock `drizzle-orm/d1` at the adapter boundary with
  `vi.hoisted` chains and keep real schema and query expressions. Call
  `vi.clearAllMocks()` in `beforeEach()` when hoisted chains are reused.

  ```ts
  const dbMocks = vi.hoisted(() => {
    const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
    const insertChain = { values: vi.fn() };
    const db = { select: vi.fn(() => selectChain), insert: vi.fn(() => insertChain) };
    return { selectChain, insertChain, db };
  });
  vi.mock("drizzle-orm/d1", () => ({ drizzle: vi.fn(() => dbMocks.db) }));
  ```

- Coverage settings live under `test.coverage` in `vitest.config.ts`
  (`pnpm run test:coverage`); `@vitest/coverage-v8` must match the Vitest version.
  If you override `test.exclude`, keep `node_modules`, `dist`,
  `playwright-report`, `test-results`, `tests/e2e/**`, and `tmp/**` excluded.
- If production test accounts must be removed, inspect dependent rows first and
  clean auth, templates, runs, likes, analytics, entitlement, and Stripe records
  as one deliberate maintenance operation.
