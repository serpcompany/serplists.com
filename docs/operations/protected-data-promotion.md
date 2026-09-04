# Protected data promotion

The only normal production path is the GitHub Actions workflow **Protected data promotion and Pages deploy**. Production is manual-dispatch only. A push to `main`, a local Wrangler command, a green build, or a migration listing cannot deploy production.

## Required repository inputs and evidence

Dispatch the workflow from the exact reviewed `main` commit and provide its full SHA, the highest migration risk classification, the exact first and last reviewed migration filenames, the successful exact-commit CI run, the successful production-shaped rehearsal run, and the allowlisted production database UUID. The workflow verifies GitHub run metadata before reading either artifact. The rehearsal workflow exports production data only inside its protected production job, deletes raw plaintext on every exit, emits and attests the repository-owned synthetic profile plus strict manifest, and verifies that attestation before import. It then restores a data-bearing export into a second isolated database, compares centralized invariants, deletes plaintext, and proves both databases absent.

For an application-only release with no database migration, dispatch both the rehearsal and production workflows with `migration_from=none`, `migration_to=none`, and `migration_classification=additive`. This is an explicit reviewed no-migration range, not a bypass: the workflow must still prove a clean migration ledger, matching Drizzle/migration schema contracts, complete invariants, successful exact-commit CI and rehearsal evidence, protected deployment approval, authenticated account-owned template/run visibility, and custom-domain health.

The protected data job resolves the live immutable D1 name and UUID, captures a Time Travel recovery point and full export, proves the live pending list exactly equals the reviewed contiguous range, captures pre-change invariants, applies migrations, proves the ledger is clean, verifies the Drizzle and migration schema contracts, and captures post-change invariants. Remote invariant capture is ledger-aware and shared by staging, rehearsal, recovery, and production. It combines aggregate checks with privacy-safe per-row HMAC projections so unchanged totals cannot conceal altered notes, progress, versions, lifecycle/frozen snapshots, ownership, or deletion state. GitHub produces an OIDC-backed artifact attestation that supplies provenance. The deploy and postdeploy jobs reject missing, modified, wrong-commit, wrong-database, or unattested evidence.

Production approval is checked against the exact merged `main` pull request and every resolvable PR author, verified commit author, verified committer, and resolved co-author; unsigned commits or unresolved co-author trailers block promotion. The dispatcher is audit metadata and cannot establish independence. High-risk approval text comes from the protected-environment review event. Irreversible changes additionally require a distinct approval through `production-owner-approval` by the configured login, whose repository permission must resolve to `admin`.

After deployment, a controlled account must own at least one active template and one active run. Protected canary credentials verify both records through authenticated APIs on the deployed Pages URL, then verify `/api/health` through the custom domain. A failure routes to the incident recovery procedure; it never performs an automatic data restore.

Reports are uploaded even on failure and retained for 90 days. The production summary must record the commit, database UUID, migration range, recovery artifacts, invariant results, deployment result, authenticated visibility, custom-domain result, and rollback/roll-forward route.

## Required GitHub settings (external blocker)

Repository code cannot create or prove these settings. Production remains blocked until an owner captures reviewable screenshots/API output proving all of them:

- `main` requires pull requests and the CI/data-regression checks, including for administrators.
- The `production` GitHub Environment exists, restricts deployment to `main`, and requires approval immediately before protected jobs run.
- A qualified independent human or `@serpcompany/<team>` is a required CODEOWNER and production environment reviewer. **No second independent human or team is currently designated.** `@devinschumacher` alone cannot satisfy independent approval.
- Only protected environments contain `PRODUCTION_CLOUDFLARE_API_TOKEN`, `PRODUCTION_BACKUP_ENCRYPTION_KEY`, `STAGING_INVARIANT_HMAC_KEY`, and canary secrets. The Cloudflare token must be narrowly scoped to the required Pages project and production D1 resources. The recovery export is encrypted before artifact upload and plaintext is removed. GitHub artifact attestations provide producer provenance; verifier jobs receive no signing capability. Configure `PRODUCTION_REPOSITORY_OWNER_APPROVER` as the verified repository-owner login required in addition to independent approval for irreversible changes.

## Credential blocker

The current developer machine's Wrangler OAuth session has production D1 write access. Repository scripts block the known package entrypoints, but source code cannot revoke an OAuth grant or prevent a person from invoking Wrangler directly. Before lifting the release hold, revoke that local production-capable grant and replace it with read-only local credentials; keep the scoped production write token only in the protected GitHub Environment. Capture Cloudflare token scope and revocation evidence.

## Break glass

Do not bypass the workflow for convenience. Break glass requires an active incident, an exact named action and target, a fresh production approval, a second observer when available, a recovery point, immediate invariants and authenticated checks, and a durable audit record. Follow the incident-response runbook and obtain new approval for every additional mutation.
