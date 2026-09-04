# Data Regression Suite

The database promotion standard defines the required evidence. Run the local,
deterministic implementation with:

```bash
pnpm run test:data-regressions
```

Use `--migration-from` and `--migration-to` for an explicit reviewed range, or
`DATA_REGRESSION_BASE_SHA` in CI to derive changed migration/maintenance
artifacts from the trusted comparison base. Every database artifact must be
covered by [`rehearsal-plans.json`](../../scripts/data/rehearsal-plans.json),
which names its actual pre-change migration, affected tables, invariant set,
and implemented fixture profile. Unknown ranges and maintenance artifacts fail
closed. Use `--report-dir PATH` to choose an ignored artifact directory. The default is
`tmp/data-reports/`. The command runs the named migration, data, authenticated
HTTP, lifecycle, concurrency, recovery, and teardown checks as one blocking
suite.

## Required matrix

The report fails unless it finds a passing named test for every row:

| Area | Automated behavior |
| --- | --- |
| Fresh schema | Complete Wrangler chain produces the Drizzle runtime contract. |
| Upgrade | The declared actual pre-change level upgrades through only the exact reviewed range. The legacy `0023` → `0024` profile remains mandatory for template evolution. |
| Invariants | Counts, ownership, active/deleted state, foreign keys, JSON, versions, progress, notes, and orphan checks remain valid. |
| Identity migration | Existing section/item/sub-item IDs remain byte-for-byte stable, while legacy missing IDs receive the exact deterministic `legacy-*` values in both templates and linked runs. |
| Structure evolution | Section, item, and sub-item add, rename, reorder, retirement, and removal preserve run-owned completion and notes. |
| Active runs | Multiple active runs with different completion states reconcile independently. |
| Frozen lifecycle | Completed, shared, archived, and already-stale runs are not silently rewritten. |
| Revalidation | Explicit revalidation reconciles a completed run and advances its revision/template version. |
| Concurrency | Stale template and run revisions return public HTTP conflict responses. |
| Authenticated visibility | Rehearsal imports byte-verified sanitized rows into isolated local D1, attaches a local-only login to the sanitized owner, then exercises the candidate `/api/templates` and `/api/checklists` handlers for owned reads and writes. The separate evaluator tests must also pass false-empty and API-error cases. |
| Recovery | A Wrangler data-only export imports into a separately migrated database and passes invariants. |
| Teardown | Repeated deterministic fixture setup followed by cleanup leaves zero users, templates, and runs. |

## Evidence

Each successful run writes:

- `data-regression-suite.md` for human review;
- `data-regression-suite.json` for automation;
- `data-regression-suite.junit.xml` for CI test reporting; and
- `data-regression-vitest.json` as the raw named-test result;
- `browser-smoke-playwright.json` for learner-visible journeys; and
- `browser-smoke-teardown.json` for observed isolated-state cleanup.

The summary records the environment, binding, exact database identity, commit,
migration range, declaration digest, affected tables, check verdicts,
authenticated sanitized-handler evidence, invariant deltas, and teardown counts. It
contains aggregate or synthetic evidence only.

The command also runs learner-visible Playwright smoke journeys with isolated
local state and an allowlisted child environment. Frontend, build, migration,
and API child processes do not inherit developer secrets or load `.dev.vars`.
The runner builds the frontend once before either local server starts, serves
that immutable artifact, and runs one browser worker against the suite's one
shared D1 instance. This is a deterministic lifecycle matrix, not a load test;
serial execution prevents cold compilation and concurrent shared-database load
from consuming the test timeout. Playwright retains a trace and screenshot on
failure; their paths are listed in the report. When
The repository promotion workflow uploads those browser artifacts alongside
the database reports. This repository enforcement does not prove that GitHub
branch rules, protected environments, independent reviewers, scoped secrets,
or Cloudflare credential isolation are configured; unresolved external controls
continue to block production.

Smoke cleanup runs on success, test failure, process error, and migration setup
failure. `browser-smoke-teardown.json` records whether isolated state existed,
whether it remained, and the observed leaked-path count. The aggregate report
also executes the exact fixture teardown and queries the remaining user,
template, and run counts; it never substitutes assumed zeroes.

CI runs this command as a blocking step and uploads Markdown, text, JSON, JUnit,
raw Vitest, browser JSON, teardown, trace, screenshot, and failure-context
evidence for 90 days. Chromium is installed before the aggregate gate, and CI
does not run a second redundant smoke step because the aggregate already owns
the browser execution. The later standalone build remains as the production
build verification. Issue #97 still owns making staging and production deploy
jobs depend on this required CI gate and installing the production execution
boundary.

The report records every tracked or unignored dirty workspace path. It also
captures a before/after filesystem inventory using path, type, size, and
modification-time metadata only; it never reads file contents. `.git/` and
`node_modules/` are excluded as immutable repository/dependency internals, but
ignored paths everywhere else remain visible to the comparison.

The command is gating by default locally, from pre-push, and in CI. It captures
the starting commit and worktree before any child test, fails if HEAD changes,
and fails if the run starts or ends dirty. Only an explicit `--non-gating`
diagnostic run may downgrade those findings to warnings, and that evidence is
not eligible for promotion. CI starts from a clean checkout and fails the aggregate if the suite creates or changes any
tracked, unignored, or ignored path outside this exact allowlist: the selected
directory under `tmp/data-reports/`, `tests/test-results/`,
`playwright-report/`, `dist/`, and `.wrangler/smoke-state/`. Broad ignored roots
such as `tmp/`, `.env*`, `*.log`, `*.tmp`, `out/`, `.next/`, `coverage/`, and
`.codex/` are not trusted. The smoke wrapper removes Wrangler's separate
`.wrangler/tmp/` scratch output and reports a leak if cleanup fails.
