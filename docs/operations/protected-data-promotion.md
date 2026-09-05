# Protected data promotion

The only normal production path is the GitHub Actions workflow **Protected data promotion and Pages deploy**. Production is manual-dispatch only. A push to `main`, a local Wrangler command, a green build, or a migration listing cannot deploy production.

## Required repository inputs and evidence

Dispatch the workflow from the exact reviewed `main` commit and provide its full SHA, the highest migration risk classification, the exact first and last reviewed migration filenames, the successful protected-`main` push CI run, the successful staging-promotion run for the merged pull request head, the successful production-shaped rehearsal run, and the allowlisted production database UUID. The workflow verifies each GitHub run's repository, event, branch, canonical workflow path, conclusion, and commit before reading its artifact. CI's comparison base must equal the verified merge commit's first parent. Staging evidence must match the main pull request head and merge tree and prove the exact migration range, data regression and teardown, clean ledger/schema, invariants, deployment, authenticated account-owned data, and custom domain before production can be requested. The rehearsal workflow exports production data only inside its protected production job, deletes raw plaintext on every exit, derives a bounded content-free relationship and edge-shape sample, emits attributed failure or success reports, attests the sanitized artifact plus strict manifest, and verifies that attestation before import. It creates both rehearsal databases during the same workflow run, proves their user catalogs and ledgers are empty, restores into the separate recovery database, compares commit/database/range/ledger-bound invariants, deletes plaintext, and proves both databases absent.

For an application-only release with no database migration, dispatch both the rehearsal and production workflows with `migration_from=none`, `migration_to=none`, and `migration_classification=additive`. This is an explicit reviewed no-migration range, not a bypass: the workflow must still prove a clean migration ledger, matching Drizzle/migration schema contracts, complete invariants, successful exact-commit CI and rehearsal evidence, protected deployment approval, authenticated account-owned template/run visibility, and custom-domain health.

The `production-preparation` job uses a read-only Cloudflare credential to resolve the live D1 identity, capture a Time Travel recovery point and encrypted export, and verify the pending range. It uploads the recovery bundle, downloads that immutable artifact, and verifies its request and content digests before the production approval job can begin. The independent reviewer includes the displayed recovery receipt token in the environment approval comment. The protected executor verifies that receipt and approval, rechecks identity and the current ledger/range, captures pre-change invariants, applies migrations, verifies the resulting ledger and schema, and captures post-change invariants. Failed recovery persistence or verification blocks approval and execution. Remote invariant capture combines aggregate checks with privacy-safe per-row HMAC projections so unchanged totals cannot conceal altered notes, progress, versions, lifecycle/frozen snapshots, ownership, or deletion state. GitHub produces an OIDC-backed artifact attestation that supplies provenance. The deploy and postdeploy jobs reject missing, modified, wrong-commit, wrong-database, or unattested evidence.

Production approval is checked against the exact merged `main` pull request and
the exact verified, attributed GitHub merge commit. Every resolvable pull-request
author, constituent commit author and committer, merge author and committer, and
resolved co-author is excluded from serving as the independent approver.
Constituent commits do not need individual signatures, but every author and
co-author must resolve to a GitHub user through GitHub's commit-author API or
promotion blocks. The dispatcher is
audit metadata and cannot establish independence. High-risk approval text comes
from the protected-environment review event. Irreversible changes additionally
require a distinct approval through `production-owner-approval` by the configured
login, whose repository permission must resolve to `admin`.

After deployment, a controlled account must own one specifically designated active template and run. `STAGING_DATA_CANARY_TEMPLATE_ID` / `STAGING_DATA_CANARY_RUN_ID` and their production equivalents identify only those mutation-safe records. As part of the approved staging or production action, protected canary credentials capture original values plus optimistic version/revision, update each designated record, read it back, restore the original value using the new optimistic counter, and verify restoration. JSON, JUnit, and human reports record template/run designation, write, read-back, and restore separately. No other owned record is eligible for mutation. Protected canaries then verify `/api/health` through the custom domain. A write, read-back, restoration, visibility, or health failure blocks completion and routes to the incident recovery procedure; it never performs an automatic data restore.

Reports are uploaded even on failure and retained for 90 days. The production summary must record the commit, database UUID, migration range, recovery artifacts, invariant results, deployment result, authenticated visibility, custom-domain result, and rollback/roll-forward route.

## Required GitHub settings (external blocker)

Repository code cannot create or prove these settings. Production remains blocked until an owner captures reviewable screenshots/API output proving all of them:

- `main` requires pull requests and the CI/data-regression checks, including for administrators.
- The `production` GitHub Environment exists, restricts deployment to `main`, and requires approval immediately before protected jobs run.
- The separate `production-preparation` environment restricts execution to the reviewed `main` commit and exposes only the read-only `PRODUCTION_READONLY_CLOUDFLARE_API_TOKEN` plus the required separated recovery/evidence keys. It must never contain the production writer token. Its verified recovery artifact must precede the fresh `production` approval.
- A qualified independent human or `@serpcompany/<team>` is a required CODEOWNER and production environment reviewer. **No second independent human or team is currently designated.** `@devinschumacher` alone cannot satisfy independent approval.
- Only protected environments contain `PRODUCTION_CLOUDFLARE_API_TOKEN`, `PRODUCTION_INVARIANT_HMAC_KEY`, `PRODUCTION_BACKUP_ENCRYPTION_KEY`, `PRODUCTION_CANARY_EVIDENCE_HMAC_KEY`, `STAGING_INVARIANT_HMAC_KEY`, `STAGING_CANARY_EVIDENCE_HMAC_KEY`, and canary secrets. Encryption, invariant, and canary-evidence keys are distinct values of at least 32 characters; missing or reused values fail closed. Canary reports retain only exact phase verdicts, generic failure codes, and a keyed evidence digest—not record IDs, titles, progress, versions, revisions, cookies, or original/probe values. Each key is exposed only to the protected step that needs it. The Cloudflare token must be narrowly scoped to the required Pages project and production D1 resources. The recovery export is encrypted before artifact upload and plaintext is removed. GitHub artifact attestations provide producer provenance; verifier jobs receive no signing capability. Configure `PRODUCTION_REPOSITORY_OWNER_APPROVER` as the verified repository-owner login required in addition to independent approval for irreversible changes.

## Credential blocker

The current developer machine's Wrangler OAuth session has production D1 write access. Repository scripts block the known package entrypoints, but source code cannot revoke an OAuth grant or prevent a person from invoking Wrangler directly. Before lifting the release hold, revoke that local production-capable grant and replace it with read-only local credentials; keep the scoped production write token only in the protected GitHub Environment. Capture Cloudflare token scope and revocation evidence.

Do not assume a staging token is isolated merely because its variable name says staging. D1 and Pages permission boundaries must be verified against Cloudflare's actual resource scope. Where account-wide permissions include both staging and production, use separate accounts or a separately reviewed narrow execution service; repository wrappers alone do not establish credential isolation.

## Break glass

Do not bypass the workflow for convenience. Break glass requires an active incident, an exact named action and target, a fresh production approval, a second observer when available, a recovery point, immediate invariants and authenticated checks, and a durable audit record. Follow the incident-response runbook and obtain new approval for every additional mutation.
