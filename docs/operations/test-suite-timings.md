# Test suite timing evidence

Installed dependencies, macOS, Node 22.23.1, pnpm 9.2.0. Wall time includes Vitest discovery and startup.

## Fast unit suite

Command: `pnpm run test:unit`

| Run | Tests | Vitest duration | Wall time |
| ---: | ---: | ---: | ---: |
| 1 | 448 | 3.02s | 3.54s |
| 2 | 448 | 3.01s | 3.54s |
| 3 | 448 | 3.08s | 3.62s |

All three runs are below the 30-second target. The suite excludes every process, browser, and database-engine test.

## Other measured gates

| Gate | Before | Current measured result |
| --- | ---: | ---: |
| Pre-commit | not recorded for the prior candidate | 8.98s wall; all commands passed |
| Pre-push command | prior complete gate 1,671s | 23.70s wall; secret scan, lint, types/env, provenance/schema, suite ownership, Unit, and fast Drizzle checks passed |
| Process/driver integration | 588.63s serial | 125.33s runner / 125.88s wall; 1,803 passed and 28 legacy opt-in tests skipped |
| Repeated invariant transport | 254.05s | 5.27s runner; one Wrangler transport plus isolated in-process assertions |
| Recovery proof | 279.81s | 157.89s wall; two distinct real full-export restore boundaries passed |
| Complete D1/browser/recovery baseline | 880.75s | Functional checks passed; final verdict intentionally failed because the pre-commit working tree was dirty |

The final clean-candidate complete verification supersedes the dirty-worktree baseline and must remain within 15 minutes.
