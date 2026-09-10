# Retained process coverage

The process suite keeps one real CLI launch for each distinct startup, argument, exit-status, environment-isolation, provider, and failure boundary. Large malformed-value matrices run against the same exported implementation in-process; repeating the full CLI for each value adds startup cost without a new process behavior.

| Removed repeated launch matrix | Retained in-process coverage | Retained real-process coverage |
| --- | --- | --- |
| Every template/run omitted, duplicate, and replaced source row at every production phase | `production-executor.test.mjs`: source/cohort validation and every downstream evidence handoff; `invariant-capture.test.mjs`: complete typed-row and invariant matrices | Representative prepare, after-approval, and post-migration cases across both tables and all three fault shapes |
| Every strict-JSON numeric spelling at each production artifact consumer | `strict-json.test.mjs` and the protected-executor artifact validation matrix | Prepare-data underflow, prepare-verify duplicate, deploy equivalent notation, and release-finalize underflow |
| Every foreign-key evidence spelling at every phase | `invariant-capture.test.mjs`: missing, nonzero, fractional, string, duplicate, and underflow values | One prepare, pre-mutation, and post-migration failure plus the raw underflow envelope |
| Every cohort mutation through the executor CLI | `production-executor.test.mjs`: every `cohortEvidenceMutations` entry at every downstream evidence handoff | Missing-selection refusal before provider transport |
| Every missing/invalid request shape for both finalizer and executor | Direct request/range validators and report identity tests | Missing finalizer request and explicit no-migration executor request |
| Every ledger corruption at both prepare and final pre-write reads | `production-executor.test.mjs`: all `driftCases` in preparation and execution with unchanged digests | Unknown prepare ledger and duplicate final pre-write ledger |
| Every D1 envelope, destination, identity, URL, and CLI-argument spelling | `deployment-smoke.test.mjs`, `environment-identity.test.mjs`, `d1-query-envelope` consumers, and argument validators | Representative malformed categories plus every distinct HTTP/read/write/cleanup transport failure |

Any new removed process invocation must add an in-process assertion against the real parser/validator and update this table. A representative process case may not replace a distinct process boundary or failure behavior.

`raw-sql-boundaries.test.mjs` separately enforces that the template-limit and team coverage harnesses use Drizzle for all fixtures, reads, and cleanup. The combined admin/billing/sitemap harness retains exactly three named infrastructure calls: migration-ledger introspection and creation/removal of the deliberate Stripe write-failure trigger. The dedicated Stripe failure harness likewise uses Drizzle for ordinary state and retains only its ledger read plus paired trigger creation/removal for seven deliberate corruption cases.
