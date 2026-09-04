# Database Environment Operations

The binding rules in
[`docs/agents/database-change-and-data-promotion.md`](../agents/database-change-and-data-promotion.md)
are authoritative. This page documents how to operate the guarded tooling; it
does not grant permission to mutate staging or production.

## Inventory and identities

The non-secret inventory is
[`scripts/data/environment-inventory.json`](../../scripts/data/environment-inventory.json).
It records the `DB` binding, name/ID policy, purpose, desired migration level,
data classification, and operator for local, staging, rehearsal, and
production.

- Local identity is the Miniflare storage mode plus its explicit persistence
  path. It never needs Cloudflare credentials.
- Staging is the checked-in preview UUID and must agree with both preview D1
  fields in `wrangler.toml`.
- Rehearsal is an ephemeral remote D1 whose exact name and UUID are supplied at
  runtime. Names must start with `serp-checklists-rehearsal-`.
- Production is the checked-in production UUID. The general data command
  refuses production fixture, import, migration-apply, and teardown operations.

All commands are dry runs unless `--execute` is present. Every invocation emits
the environment, binding, database name, exact database identity, Git commit,
and repository migration range before it can execute. Remote operations query
D1 by the allowlisted name and compare the live name and UUID with the report.
A mismatch stops the operation before the action command runs.

```bash
node scripts/data/data-command.mjs migration-ledger --environment local
node scripts/data/data-command.mjs migration-ledger --environment staging
node scripts/data/data-command.mjs identify --environment production
```

The ledger command is evidence of applied/pending state; the repository range
alone is not evidence that a database is current.

## Deterministic fixtures

The fixture contract is
[`scripts/data/fixture-inventory.json`](../../scripts/data/fixture-inventory.json).
Setup deletes and recreates exactly one reserved user, template, and run with
fixed IDs and timestamps. It creates no password, credential account, or
session. Teardown deletes only those exact IDs and fails if the returned counts
are not all zero. Repeating setup produces the same logical data.

For an isolated local run:

```bash
node scripts/data/data-command.mjs migration-apply \
  --environment local \
  --persist-to .wrangler/rehearsals/issue-95

node scripts/data/data-command.mjs migration-apply \
  --environment local \
  --persist-to .wrangler/rehearsals/issue-95 \
  --execute

node scripts/data/data-command.mjs fixture-setup \
  --environment local \
  --persist-to .wrangler/rehearsals/issue-95

# Inspect the printed target and command, then opt in.
node scripts/data/data-command.mjs fixture-setup \
  --environment local \
  --persist-to .wrangler/rehearsals/issue-95 \
  --execute

node scripts/data/data-command.mjs fixture-teardown \
  --environment local \
  --persist-to .wrangler/rehearsals/issue-95 \
  --execute
```

The staging authenticated smoke identity is the non-secret label
`staging-data-smoke-v1`. Its credential comes only from a protected staging
environment secret and it may be provisioned only through the authenticated
application API. Tests must not invent accounts, use arbitrary signups, reuse
customer identities, or write production. The staging release operator owns
its teardown.

## Production-shaped rehearsal

Raw production data must never enter Git, fixtures, logs, reports, or an
ordinary local test. The separate #97 production executor will create two
different exports:

- `recovery-export` is the complete protected backup and never enters a
  rehearsal or sanitizer input.
- `sanitizer-source-export` uses Wrangler's verified `--no-schema` data-only
  form and exists only long enough for the repo-owned sanitizer to read it.

There is no caller-written safety declaration. The only accepted sanitizer is
the allowlisted `source-derived-shape-v2` implementation in
[`scripts/data/sanitizer-policy.json`](../../scripts/data/sanitizer-policy.json).
It loads the protected data-only export into an in-memory replay of the
repository schema, selects a bounded set of real user-template-run
relationships covering every `0024` migration edge shape, and replaces all
identifiers and customer-authored strings with deterministic rehearsal values.
It excludes authentication, billing, session, password, credential, and share
token material. It fails closed when the source does not provide the required
relationships or edge-case coverage; it never substitutes a fixed fixture.

The strict manifest records source-export and database-identity hashes, exact
Git commit, source date, sanitizer version, access owner, retention deadline,
source and selected row counts, covered edge shapes, teardown requirements,
artifact hash, and manifest-integrity hash. These unkeyed hashes detect
accidental or post-generation byte changes; they do not authenticate the author
or authorize an operation. Import rejects unknown manifest fields, unknown
sanitizer versions, non-allowlisted access owners, expired retention, missing
edge coverage, privacy-unsafe output, or changed integrity hashes. The identity-bound
export evidence must record matching before/after source database UUIDs that
exactly equal the checked-in production inventory UUID; the
manifest retains only its hash. An arbitrary manifest field such as
`containsDirectIdentifiers=false` has no authority.

Inside the protected production-source job, generate the artifact rather than
writing a manifest:

```bash
node scripts/data/production-identity-bound-command.mjs sanitizer-export \
  --database-name serp-checklists-db \
  --database-id PRODUCTION_UUID \
  --output tmp/production-sensitive/private-source-data.sql \
  --evidence tmp/data-evidence/production-shaped.identity.json

node scripts/data/sanitize-rehearsal-export.mjs \
  --input tmp/production-sensitive/private-source-data.sql \
  --output tmp/data-evidence/production-shaped.sql \
  --manifest tmp/data-evidence/production-shaped.manifest.json \
  --source-identity-evidence tmp/data-evidence/production-shaped.identity.json \
  --source-date YYYY-MM-DD \
  --issue 95 \
  --approver-identity ALLOWLISTED_REQUESTED_IDENTITY \
  --retention-deadline RFC3339_WITHIN_24_HOURS \
  --migration-from 0024_safe_template_evolution.sql \
  --migration-to 0024_safe_template_evolution.sql \
  --execute
```

The raw source input must be inside non-artifact `tmp/production-sensitive/`. The sanitizer
deletes that raw input after success and also on validation or request-context
failure once it has safely resolved the contained path. Inputs outside that
directory are refused and never deleted. The source-derived, content-free SQL and its generated
manifest are the only import inputs.

Create a unique rehearsal resource:

```bash
node scripts/data/data-command.mjs rehearsal-create \
  --database-name serp-checklists-rehearsal-issue-95 \
  --evidence tmp/data-reports/rehearsal/source-creation.json \
  --execute
```

The protected workflow creates both source and recovery databases during the
same run, records commit- and run-bound creation evidence, and propagates each
returned UUID. Every later write requires that UUID twice: once as
the target and once as explicit confirmation. The protected workflow verifies
that the target is newly created and empty, builds and ledgers the exact schema
immediately before the reviewed range, verifies the attestation, imports the
`0023`-compatible sanitized profile, captures pre-change invariants, and only
then applies the reviewed migration range. The legacy baseline helper refuses
every remote target.

The exact range and affected-domain obligations come from
[`scripts/data/rehearsal-plans.json`](../../scripts/data/rehearsal-plans.json).
The CI gate derives changed migration and maintenance artifacts from its trusted
base commit; the rehearsal dispatch supplies the exact reviewed range. A future
`0025` or maintenance artifact cannot reuse the fixed `0024` proof: it must add
an independently reviewed declaration, fixture profile, affected tables, and
domain invariants first. After sanitized import and migration, the workflow
restores the same artifact bytes into isolated local D1, verifies their digest,
attaches a local-only credential to the sanitized owner, and exercises the
candidate authenticated template/run read and write handlers. The resulting
proof is bound to commit, range, local database identity, and sanitizer digest
inside `rehearsal-promotion.json`.

These repository workflows prohibit manual staging or production mutation and
enforce their internal order. Production remains blocked until live GitHub
branch protection, protected environments, an eligible independent reviewer,
scoped secret placement, and Cloudflare credential isolation are separately
configured and verified. Repository documentation or green CI is not evidence
that those external controls exist.
The commands below document the guarded primitives, not an alternate manual
remote runbook; their displayed order does not authorize execution.

```bash
node scripts/data/data-command.mjs migration-ledger \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95 \
  --database-id REHEARSAL_UUID \
  --execute

node scripts/data/data-command.mjs rehearsal-baseline \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95 \
  --database-id REHEARSAL_UUID \
  --confirm-database-id REHEARSAL_UUID \
  --creation-evidence tmp/data-reports/rehearsal/source-creation.json \
  --approver-identity @devinschumacher \
  --before 0024_safe_template_evolution.sql \
  --execute

node scripts/data/data-command.mjs rehearsal-import \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95 \
  --database-id REHEARSAL_UUID \
  --confirm-database-id REHEARSAL_UUID \
  --input /protected/path/sanitized.sql \
  --manifest /protected/path/manifest.json \
  --execute

node scripts/data/data-command.mjs migration-apply \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95 \
  --database-id REHEARSAL_UUID \
  --confirm-database-id REHEARSAL_UUID \
  --execute

node scripts/data/data-command.mjs invariant-capture \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95 \
  --database-id REHEARSAL_UUID \
  --execute
```

The invariant query emits aggregate counts plus privacy-safe per-row HMAC
proofs: total/active/deleted rows, distinct-owner counts, JSON validity,
orphans, notes, progress, versions, lifecycle/frozen snapshots, ownership, and
deletion state. Customer content and direct identifiers are processed only to
derive protected digests and are never written to reports.

## Recovery evidence

D1 Time Travel is remote-only. Capture a bookmark for staging or an isolated
rehearsal before a risky rehearsal step:

```bash
node scripts/data/data-command.mjs recovery-bookmark \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95 \
  --database-id REHEARSAL_UUID \
  --execute
```

Schema-only exports use `export`. Data exports use the separate
`rehearsal-export` operation, which accepts only a sanitized rehearsal identity
and requires exact UUID confirmation. Wrangler writes a temporary
`--no-schema` export, the command verifies that it contains only the repo-owned
synthetic identities and allowlisted tables, removes migration-ledger rows by
normalizing back to the reviewed profile, and deletes the raw intermediate.
The resulting file imports cleanly after migrations have already built a fresh
schema. All exports must stay under ignored
`tmp/data-evidence/` so data cannot be casually added to Git:

```bash
node scripts/data/data-command.mjs rehearsal-export \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95 \
  --database-id REHEARSAL_UUID \
  --confirm-database-id REHEARSAL_UUID \
  --approver-identity ALLOWLISTED_REQUESTED_IDENTITY \
  --output tmp/data-evidence/issue-95-rehearsal.sql \
  --execute
```

A production bookmark/export/source-export is never executable from the
general data CLI. Even a caller that sets every GitHub-looking environment
variable receives a blocking error before Wrangler runs. The general command
may render the exact production plan for review only. Issue #97 must implement
the separate executor whose non-forgeable credential/OIDC boundary and GitHub
Environment approval authorize the production action.

Remote rehearsal imports and sanitizer execution record workflow-request
fields for the exact Git SHA, repository, environment label, run ID, workflow
name, and requested approver. Those fields are explicitly
`unverified-request-metadata`: environment variables can be imitated and are
not proof of authorization, identity, or approval. They become trustworthy
evidence only when #97 binds them to signed/OIDC-backed workflow evidence.

Production recovery uses `recovery-bookmark` followed by `recovery-export`;
the sanitizer source uses the distinct `sanitizer-source-export`. Schema-only
inspection uses `export`. Plan all three and inspect their printed identities;
never add `--execute` in the general CLI. Time Travel restore is
intentionally absent from the general command because it overwrites a database
in place and requires fresh approval for the exact recovery action.

## Retention and teardown

The operator named in the import manifest owns access and cleanup. Remove the
sanitized SQL, manifest, exported evidence containing data, protected staging
identity, and ephemeral D1 by the recorded deadline. Reports may retain only
non-private aggregate evidence.

```bash
node scripts/data/data-command.mjs rehearsal-teardown \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95 \
  --database-id REHEARSAL_UUID \
  --confirm-database-id REHEARSAL_UUID

node scripts/data/data-command.mjs rehearsal-teardown \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95 \
  --database-id REHEARSAL_UUID \
  --confirm-database-id REHEARSAL_UUID \
  --execute
```

The live name/UUID check occurs before deletion, and the delete command uses
Wrangler's documented database-name argument. An unknown name, wrong UUID,
production UUID, expired manifest, missing confirmation, or leaked fixture row
is a blocking error.

Data retention semantics do not change by environment: `deleted_at` is the
soft-deletion marker, restoration clears it through reviewed application or
maintenance behavior, and archival/lifecycle state remains domain data rather
than an instruction to delete rows. Hard deletion and Time Travel restore are
separate approved operations under the binding standard.

## Temporary remote rehearsal identity proof

After code review, the #95 verifier may create one empty non-production D1 only
to prove the name/identity/delete guards. Use a unique run suffix and do not
apply migrations or import data during this identity-only proof:

```bash
node scripts/data/data-command.mjs rehearsal-create \
  --database-name serp-checklists-rehearsal-issue-95-run-suffix

node scripts/data/data-command.mjs rehearsal-create \
  --database-name serp-checklists-rehearsal-issue-95-run-suffix \
  --execute

node scripts/data/data-command.mjs identify \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95-run-suffix \
  --database-id RETURNED_UUID \
  --execute

node scripts/data/data-command.mjs rehearsal-teardown \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95-run-suffix \
  --database-id RETURNED_UUID \
  --confirm-database-id RETURNED_UUID

node scripts/data/data-command.mjs rehearsal-teardown \
  --environment rehearsal \
  --database-name serp-checklists-rehearsal-issue-95-run-suffix \
  --database-id RETURNED_UUID \
  --confirm-database-id RETURNED_UUID \
  --execute
```

Expected evidence is: the create report names `rehearsal` and records the UUID
returned by Cloudflare; `identify` resolves the same name and UUID; teardown
prints the same exact identity before deletion; Wrangler reports successful
deletion; and a final read-only D1 info lookup for the unique name reports that
the resource no longer exists. Preserve command output with Git SHA and run
suffix, but no credentials or database content.
