# Database Change and Data Promotion Standard

This is the repository's binding standard for Drizzle schema changes, Cloudflare D1 migrations, data rewrites, database environment management, and application promotions that depend on database state. It applies to humans, agents, CI, and emergency operators.

When another repository document or script conflicts with this standard, stop and treat this standard as authoritative. Existing commands are capabilities, not permission to run them. Issue [#91](https://github.com/serpcompany/serplists.com/issues/91) keeps production changes on hold until the required protections are implemented and independently proven.

## Authority boundaries

Each concern has one authority:

| Concern | Authority | Rule |
| --- | --- | --- |
| Runtime tables, columns, relations, and TypeScript types | `db/schema/**/*.ts` exported through `db/schema/index.ts` | Application code may depend only on this contract. |
| D1 schema and data-change history | Numbered SQL in `db/migrations/` | Wrangler applies this history and records it in `d1_migrations`. |
| State applied to one database | That database's `d1_migrations` ledger plus live schema inspection | A file existing in Git does not mean it has been applied. |
| Full schema snapshot | `db/schema.sql`, generated from a database built by the complete migration chain | It is a derived review artifact, never an independent input or a migration path. |
| Repeatable fixtures | `db/seeds/` | Fixtures do not belong in migration history. |
| Explicit one-off maintenance | `db/maintenance/` | Maintenance files do not alter schema history and require the same classification, rehearsal, approval, and evidence as an equivalent migration. |

Wrangler numbered migrations are the only live D1 migration ledger. Drizzle Kit may help generate SQL for review, but `drizzle-kit push` is prohibited in every environment and `drizzle-kit migrate` must not apply changes to D1. Schema changes reach D1 only as reviewed, numbered SQL through the Wrangler migration path.

`pnpm db:generate -- --name descriptive_snake_case` is the only supported way to create a new numbered migration. It runs Drizzle Kit, requires an untouched migration directory, creates one SQL/snapshot/journal pair, and locks their hashes in `db/migration-provenance.json`. Calling `drizzle-kit generate` directly, creating numbered SQL by hand, editing generated SQL or snapshots, updating a recorded hash, or using a custom migration is prohibited and fails `pnpm check:data:migration-provenance`. A release may contain multiple independently generated migrations: each ordered adjacent snapshot transition must reproduce its exact SQL through the pinned Drizzle Kit public snapshot-diff API, and the final snapshot must match the current schema. The wrapper still generates one migration per invocation. If a generated schema change needs a data rewrite, keep the generated migration immutable and put the separately classified, idempotent operation under `db/maintenance/`; never hide handwritten SQL inside the generated artifact.

The repository's pre-Drizzle numbered SQL history is a single immutable legacy baseline through `0024_safe_template_evolution.sql`. `db/migrations/meta/0024_snapshot.json` describes the Drizzle runtime contract at that point; `_journal.json` deliberately begins at index 24 so the next generated Wrangler migration is `0025`. The two historical `0002` files and the missing `0006` are grandfathered exactly as hashed in the provenance manifest and must never be renamed or normalized. The checker hard-locks the baseline header plus the complete ordered file identities and hashes independently of comparison-branch metadata; changing the manifest cannot extend or redefine the legacy boundary. This metadata is generation provenance only: Wrangler SQL plus each database's `d1_migrations` ledger remain the sole D1 apply authority.

Any change to the Drizzle runtime contract must include the matching Wrangler migration in the same pull request. Any migration that changes runtime-visible schema must include the matching Drizzle change. `db/schema.sql` must be regenerated from the replayed migration result; hand-editing it as a design input is invalid.

The only exception is a **contract correction**: Drizzle metadata may be corrected without a new no-op migration when generated evidence proves the exact tables, columns, affinities, nullability, defaults, primary keys, foreign keys, and indexes already exist throughout the applied Wrangler history. A contract-correction change must contain no new or modified migration, must name the already-applied migrations that created the state, and must pass the complete replay, remote catalog, and snapshot comparisons. It cannot add a runtime object or constraint absent from the applied migration catalog; automation must reject that as a real database change requiring a new migration.

CI fetches full Git history and verifies every correction property against its exact creating migration as it existed on the base branch, replaying only through that migration before comparing the expected value. Staging and production checks separately read the live `d1_migrations` ledger, record `appliedThrough`, and fail when any repository migration is absent; local replay evidence alone never claims a remote migration was applied. The remote ledger must exactly match the ordered repository history: malformed, duplicate, reordered, or Git-unknown applied entries are blocking drift even when the live schema happens to match.

Legacy foreign keys that predate Drizzle relation declarations are temporarily enumerated in `SQL_ONLY_RELATION_ALLOWLIST`. The allowlist records exact local columns, referenced tables/columns, and update/delete actions; it exists only to represent already-applied historical constraints and may only shrink as relations move into Drizzle. Any relation not declared by Drizzle or exactly present in that allowlist is blocking drift. New relations must be declared in Drizzle and introduced by a numbered migration.

New migration replay, schema comparison, invariant, rehearsal, data-promotion, production maintenance, and recovery tooling belongs under `scripts/data/`. This dedicated path makes database-safety ownership automatic. Existing database-safety and production-mutation executables and their SQL-building libraries may remain at their current paths while they are migrated deliberately, but every identified current surface must have an explicit `.github/CODEOWNERS` entry. `package.json` is also owned because its scripts expose database migration and production-data command entrypoints. A newly discovered or added mutation surface outside `scripts/data/` is unguarded and blocks promotion until ownership is added or the surface is moved.

## Environment boundaries and ownership

Resolve names and database IDs from the checked-out `wrangler.toml` immediately before an operation. Every command report must print the environment label, binding, database name, database ID, Git commit, and migration range before it can pass.

| Environment | Purpose and data | Responsible operator | Write boundary |
| --- | --- | --- | --- |
| Local | Disposable Miniflare state and deterministic fixtures; no production secrets or unsanitized production data | The developer or agent running the task | May be rebuilt and migrated from the repository without external approval. |
| Staging / preview | Shared remote rehearsal database and dedicated test identities; only approved sanitized production-shaped data | The staging release operator for the pull request | Writes use the protected staging path after identity checks; test data must have an owner and teardown rule. |
| Production | Customer data and the production migration ledger | A protected workflow service identity, released by a designated human production approver | No ordinary developer or agent has a direct write path. Every mutation uses the approved promotion or break-glass path. |

Local, staging, and production database IDs must be distinct. A local or preview job that resolves the production ID fails closed. Unknown, missing, duplicated, or mismatched identity is a blocking error, not a prompt to infer the target.

The change author owns the plan, migration, tests, and evidence. A human staging release operator owns staging authorization and verification. A human production approver who did not author the change owns the production decision. The protected workflow identity executes production operations; an agent may prepare or dispatch a request but cannot approve its own production change.

Production-shaped data may enter rehearsal only through an approved sanitized export/import process. The evidence must record its source date, sanitizer version, access owner, retention deadline, and cleanup result. Customer content, credentials, session tokens, password material, and direct identifiers must not enter fixtures or CI artifacts.

## Required change record

Every pull request that touches `db/schema/**`, `db/migrations/**`, `db/schema.sql`, `db/seeds/**`, `db/maintenance/**`, D1 bindings, database guards, or production deployment logic must contain a database change record with:

- issue and pull request;
- migration name and classification;
- affected tables, columns, indexes, and environments;
- compatible application versions and the expand/migrate/contract phase;
- expected row-count, ownership, active/deleted, and version impact;
- fixture and production-shaped rehearsal plan;
- recovery bookmark/export plan and restore target;
- preflight, invariant, authenticated smoke, and teardown checks;
- roll-forward and rollback triggers;
- required reviewers and approval gates;
- report artifact names and retention requirement.

Missing or inaccurate fields block review. CI-generated evidence replaces self-reported results where automation exists.

Migration filenames use the next unambiguous zero-padded sequence and a descriptive snake-case action: `NNNN_descriptive_action.sql`. Never renumber, reorder, or modify a migration that has been applied to a shared environment; add a corrective migration instead.

## Classification and approval

Classify by the highest-risk behavior in the change:

| Class | Definition | Minimum gate |
| --- | --- | --- |
| Additive | Adds nullable or safely defaulted schema without rewriting existing rows; the old application remains compatible | Fresh-chain and upgrade tests, staging promotion, independent review |
| Backfill | Inserts or updates existing rows without deleting them or changing ownership | Additive gates plus production-shaped rehearsal, data invariants, recovery evidence, and explicit production approval |
| Destructive | Drops, renames, replaces, deletes, retires, changes ownership, or makes old code/data incompatible | Backfill gates plus expand/migrate/contract separation and a reviewed rollback or compensating roll-forward |
| Irreversible | Information cannot be reconstructed exactly, or recovery cannot be proven inside the recovery window | Destructive gates plus repository-owner approval and a written decision explaining why the operation is necessary |

A mixed migration inherits the strictest class. A change is irreversible when uncertain. Production approval is always explicit for data rewrites, ownership changes, deletes/retirements, and operations that cannot be safely rerun.

## Expand, migrate, contract

Database and application compatibility spans releases:

1. **Expand:** add schema that both the deployed and proposed application can tolerate. Deploy no code that requires an unapplied migration. Completion means the old application operates against the expanded schema and the fresh-chain and upgrade suites pass.
2. **Migrate:** backfill through an idempotent, restartable operation with checkpoints and invariants. Completion means every intended row is accounted for and both old and new application reads remain safe.
3. **Contract:** remove old schema or compatibility code in a later pull request only after staging and production evidence shows no remaining readers or old-format rows. Completion means the removal has independent recovery evidence and the full test suite passes.

When a safe compatibility window cannot be created, classify the change as destructive or irreversible and use an approved maintenance window. Never hide an incompatible application cutover inside the same opaque step as an unreviewed data rewrite.

## Required verification

Database-affecting changes are incomplete until automation proves all applicable checks:

- replay every Wrangler migration into a fresh local D1 database;
- compare the replayed schema with the Drizzle runtime contract and generated `db/schema.sql`;
- upgrade a fixture database from the current shared-environment migration level to the proposed level;
- verify table and owner-scoped row counts, ownership, active/deleted state, foreign keys, orphan absence, JSON validity, expected version values, and domain-specific lifecycle state;
- compare privacy-safe per-row HMAC projections for templates and runs so notes, progress, frozen/shared content, lifecycle fields, versions, and deletion state cannot be hidden by unchanged aggregate counts; reports may contain only digests and generic differences, never customer content or direct identifiers;
- verify migrations and maintenance operations are restartable or have a documented checkpoint/recovery boundary;
- run authenticated API tests proving account-owned templates and runs remain visible and writable as specified;
- exercise concurrency controls when template or run revisions change;
- prove test identities, templates, runs, and rehearsal databases are removed or retained according to the recorded teardown plan;
- rehearse recovery in a non-production database for every backfill, destructive, or irreversible change.

The authenticated check must fail if qualifying account-owned rows exist in D1 but the API errors or returns an incorrect empty collection. A successful build, migration listing, schema-only query, or `/api/health` response is not evidence of a successful data promotion.

The blocking local gate exercises the database behavior families, routes, API operations, and personas recorded in `scripts/data/route-coverage-inventory.json`, including public and authenticated parameterized routes, account and team roles, billing/admin queries, and writable lifecycle branches. It applies the full Wrangler chain before local fixtures, runs the actual Worker handlers and browser pages, and rejects browser exceptions, console errors, failed API responses, loading stalls, and false empty collections. Page/API interception is disabled; external service doubles may replace only outbound provider calls while Worker and D1 operations remain real. Lightweight route and server-entrypoint discovery detects uncovered application surfaces. Runtime proof comes from successful scenario assertions against migrated local D1, rather than source rewriting or execution tracking for each query call; inventory fingerprints never count as runtime coverage. Every required scenario needs successful commit- and migration-bound evidence. The ordinary consuming-page checks must reject a migration/query incompatibility, an incorrect empty collection despite successful HTTP status, and a failed write acknowledged as successful. Missing scenarios, reports, or negative-control proof block the aggregate even when individual selected tests pass.

CI and promotion workflows must emit both machine-readable JSON or JUnit and a human-readable report. Reports must identify the exact commit and database, list pre/post invariants and migration ledger state, and include authenticated and custom-domain smoke results. Retain CI artifacts for at least 90 days. Link the durable, non-private release summary and artifact run from the change's pull request and issue so evidence remains discoverable after artifact expiry. Reports and links must not expose customer content, credentials, tokens, direct identifiers, or other private data.

## Allowed promotion path

### Local development

1. Confirm the target is local and print its identity.
2. Apply the full Wrangler migration chain to a clean database.
3. Load deterministic fixtures.
4. Run schema, upgrade, invariant, lifecycle, authenticated API, and teardown tests required by the classification.
5. Generate the schema snapshot and reports.

Local completion requires a clean replay and reports that account for every expected invariant.

### Staging

The atomic staging promotion path must run in this order:

1. resolve and verify the staging database identity, current ledger, exact application commit, and reviewed migration artifacts;
2. capture the required staging recovery point;
3. apply the exact reviewed migration artifacts;
4. verify ledger, schema, and all required data invariants;
5. deploy the schema-dependent application commit to staging;
6. verify authenticated data behavior, custom-domain behavior, and test-data teardown;
7. publish the staging report and link it from the pull request and issue.

Staging completion requires the report and an independently reviewable preview result. A staging rehearsal never authorizes production.

An ephemeral migration rehearsal must start with a newly created empty database, build and ledger the exact repository schema immediately before the reviewed migration range, import only the attested sanitized data, and then apply the reviewed range. Direct remote use of the legacy baseline helper is prohibited.

**Current enforcement status:** `.github/workflows/cloudflare-pages-deploy.yml` now orders staging migration, ledger/schema/invariant verification, deployment, authenticated account-owned checks, and custom-domain checks. Production is manual-dispatch only and consumes exact-commit CI/rehearsal evidence through the separate protected executor. The workflow remains unavailable for production authorization until the external GitHub Environment, branch rules, independent reviewer, scoped secrets, and Cloudflare credential revocation listed in `docs/operations/protected-data-promotion.md` are configured and independently proven. Local implementation and isolated rehearsal may continue; a manual migration or direct deploy is never a substitute.

### Production

Before preparation can be approved, and again immediately before migration writes, validate the ordered applied ledger prefix and compare the complete live source catalog against repository migrations replayed through that prefix. Tables, all columns/defaults/constraints, indexes, triggers, and views must match; unknown, missing, or changed objects block every write. Bind privacy-safe typed source-schema digest/count/status evidence to the exact commit, database, source ledger, and reviewed range. Pending migrations must not require the candidate schema early. Source proof never satisfies deployment readiness: the separate strict post-migration schema, ledger, and invariant gates remain mandatory.

The protected production workflow is the only normal production path, in this order:

1. identify and allowlist the production database;
2. capture a fresh Time Travel bookmark and durable export;
3. inspect the ledger and fail if the migration range differs from the approved range;
4. attach the successful production-shaped rehearsal for the exact commit and artifacts;
5. obtain explicit human production approval;
6. apply the reviewed Wrangler migrations;
7. verify ledger, schema, and all pre/post data invariants;
8. deploy the compatible application commit;
9. run authenticated account-owned data checks and custom-domain smoke checks;
10. publish the immutable release report and request affected-user confirmation when applicable.

Any unknown identity, pending unapproved migration, missing recovery evidence, failed invariant, failed smoke check, or artifact mismatch stops the workflow. Application deployment depends on successful migration and invariant jobs and cannot run in parallel, continue on error, or reduce a failure to a warning.

## Recovery decisions

Prefer rollback of application code when it restores compatibility without mutating data. Prefer roll-forward when the migration completed, the resulting data is valid, old code is incompatible, and a reviewed corrective migration has lower risk than restoring data.

Restore data only when live-state evidence shows corruption or loss and the approved recovery point is newer and complete enough for the stated recovery objective. Test the restore on an isolated database first. A production Time Travel restore, import, rebinding, direct deployment, or ad hoc SQL execution is a production mutation and requires a fresh explicit approval for that exact target and action.

After any failed promotion, preserve logs and reports, stop further mutations, declare the observed state, and choose rollback or roll-forward in writing before resuming.

## Break glass and incidents

Break glass is limited to active containment when the normal workflow cannot restore service quickly enough. It requires:

1. an incident issue with severity, customer impact, commander, operator, and timeline;
2. live resolution of the exact commit, database identity, ledger, and recovery point;
3. fresh approval from a human production approver for one named action;
4. a second human observing the operation when available;
5. immediate invariant and authenticated verification;
6. a durable audit entry and a follow-up pull request that brings repository history and automation back into agreement.

Break glass does not authorize an unrelated migration, cleanup, deploy, restore, or repeated attempt. Every additional production mutation needs a new explicit approval.

Treat confirmed customer-data loss, ownership exposure, or unrecoverable mutation as P0. Treat widespread data unavailability or an application/schema incompatibility affecting production reads or writes as P0 until bounded. Record detection time, impact, database and commit identities, decisions, approvals, actions, verification, customer confirmation, and prevention work. Convert every prevention finding into an automated check or a tracked implementation issue.

## Review ownership

These paths retain accountable review routing. The repository owner has waived the separate-human pull-request approval requirement. Pull requests still require the blocking checks; incident #91 additionally requires independent Standards, Spec, and red-team approval of the exact candidate. This PR exception does not change the fresh, independent human production-approval requirement.

| Paths | Required owner |
| --- | --- |
| `db/schema/**`, `db/migrations/**`, `db/schema.sql` | Database contract owner |
| `db/seeds/**`, `db/maintenance/**`, invariant and migration tooling | Data safety owner |
| `wrangler.toml`, D1 binding checks, `.github/workflows/**` production gates | Production platform owner |
| This standard | Database contract owner and production platform owner |

The current `.github/CODEOWNERS` mapping to repository owner `@devinschumacher` is accountable routing: it identifies who receives review requests and designates durable owners. It is not proof of independent production approval. No qualified second human or GitHub team is currently designated in this repository. Do not invent or assign one.

Issue [#97](https://github.com/serpcompany/serplists.com/issues/97) cannot close, and production promotion remains blocked, until the repository owner designates a qualified independent human or `@serpcompany/<team>` and the protected production environment enforces that fresh approval. Keep `@devinschumacher` as accountable CODEOWNERS routing and retain the required PR/check protections, including administrator enforcement. The PR-review exception does not let a change author satisfy independent production approval.

Code review and production approval remain separate. Pull-request approval never authorizes a production action. The protected production environment must request and record a fresh approval event immediately before the exact production mutation or deployment, even when the same eligible human previously reviewed the pull request. Until the required branch and environment protections are installed and tested, production promotion remains blocked rather than relying on voluntary review.

## Pull request checklist

Every database-affecting pull request must include this completed checklist in its description:

- [ ] I named the issue, migration, classification, environments, and compatibility phase.
- [ ] I paired runtime schema and Wrangler migration changes and regenerated `db/schema.sql` from a clean replay.
- [ ] I recorded expected row, ownership, deletion, JSON, version, and lifecycle effects.
- [ ] I attached fresh-chain, upgrade, invariant, authenticated API, and teardown results.
- [ ] I attached production-shaped rehearsal and recovery-drill evidence when required.
- [ ] I defined rollback and roll-forward triggers and the exact recovery method.
- [ ] I identified the required independent owners and production approval gate.
- [ ] I made no production mutation or deployment as part of pull-request validation.

Approval means the reviewer verified the evidence against the exact diff and commit. Checking boxes without generated evidence does not satisfy the gate.
