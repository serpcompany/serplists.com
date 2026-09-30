# Harness hardening

Last updated: 2026-09-30

## Goal

Enforce, mechanically, every verification OpenAI's harness engineering write-up recommends
for an agent-written codebase, allow no exceptions (file-size caps, lint suppressions,
dependency baselines, skipped tests) without an extremely good reason recorded here, and
allow no code comments: code is structured, named and documented so that it needs none.

## Sources

- OpenAI, "Harness engineering: leveraging Codex in an agent-first world" (2026-02-11).
- The owner's rules (2026-09-30): no exceptions for line counts and the like, and no code
  comments at all, enforced by checks.

## Gap analysis (2026-09-30)

| Practice | Before | Plan |
| --- | --- | --- |
| Custom lints with fix-it messages; layered dependency rules; docs structure, links and freshness checks; AGENTS.md as a map; exec plans; per-worktree app; Chrome DevTools, snapshots and video; agent review on every push | In place | Keep |
| File-size limit (500 lines) | 8 files exempt, 3,120 lines over | Split them; delete the exemption list |
| Dependency rules | 5 known violations baselined | Fix them; delete the baseline |
| Lint suppressions | 4 suppressed errors, 2 `eslint-disable` lines | Fix them; delete the mechanism |
| Skipped tests | 28, behind `RUN_WRANGLER_INTEGRATION` | Run them in a suite, or remove what other suites cover |
| "Prefer shared utilities" | `jscpd` installed, never run | Run it in `check:repo`; remove clones |
| Naming conventions | None | Lint them |
| Validate at boundaries | Policy only | Lint unvalidated casts of external data |
| Dead code | None | `knip` in `check:repo` |
| Stricter types | `strict` only | Enable `noUncheckedIndexedAccess` and related flags |
| Quality grades on a cadence | Manual | The weekly doc gardener re-grades changed rows |
| Background refactoring PRs | Weekly report issue | A weekly code-gardening job: one small debt fix per PR |
| Agents act on review feedback | Manual | An `@claude` workflow that addresses review comments |
| Logs, metrics and traces an agent can query | `grep` over JSON logs | A query tool over the structured logs: filters, per-route latency, per-request timeline |
| No code comments | About 5,900 comments in 1,000 files, plus YAML, TOML, SQL and CSS | A lint rule and a repository check; remove them all, moving what they knew into docs, names and tests |

## Phases

1. [ ] No exceptions: split the 8 oversized files, fix the suppressions, dependency
   violations, directives and skipped tests, delete the exception mechanisms, and add a
   check that they stay gone.
2. [ ] Comment enforcement tooling: the ESLint rule and the check for other file types,
   with tests; size the new verifications in report mode.
3. [ ] Remove every comment, area by area, moving what each one knew into the doc that owns
   the area, a name, or a test; then enable the comment checks.
4. [ ] New verifications: naming conventions, boundary validation, duplicates, dead code,
   stricter types; fix what each finds, then enforce it.
5. [ ] Agent loops: code gardening, quality re-grading, `@claude` feedback, each tried in
   the sandbox repository first.
6. [ ] Observability: the log query tool and its skill.
7. [ ] Docs, `pnpm run verify`, and the full browser suite.

## Exceptions allowed

None yet. Generated files (`cloudflare-env.d.ts`, `next-env.d.ts`, `docs/generated/`) are
not authored code; the checks skip them because a generator rewrites them.

## Progress

- 2026-09-30: gap analysis; phases 1 and 2 started.

## Decision log

- 2026-09-30: remove the exception mechanisms instead of shrinking them over time. The
  owner asked for no exceptions without an extremely valid reason.
- 2026-09-30: no code comments, in every language the repository writes. Knowledge a
  comment held moves to the doc that owns the area, a better name, or a test named for the
  behavior.
