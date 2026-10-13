---
status: accepted
---

# Deploys refuse pending migrations, which a person applies first

A deploy never applies a D1 migration. Before it builds, each deploy checks its environment's
database: `pnpm run verify:staging` for Staging and `pnpm run verify:prod:d1` for Production. A
pending migration, or a schema missing what the code needs, fails the deploy. A person applies the
migration with the owner's go-ahead, after a backup or a Time Travel bookmark, and then the deploy
runs again. SERP's Git Workflow has the deploy migrate the database instead.

Kept from the Pages deploys, whose gate the Workers deploys carried over (2026-10-01), and
recorded on 2026-10-12. The steps are in
[`database-operations.md`](../agents/database-operations.md#applying-migrations).

## Why

- **A redeploy can't undo a migration.** D1 goes back only by restoring to a point in time, and a
  bookmark taken just before the migration is what makes that restore exact. Each of `0028` to
  `0033` was applied by a person who noted one first.
- **Some migrations need a check and a decision first.** `0028`'s backfill stops on a handle
  collision, and collisions are renamed by hand: production's two were found by a read-only
  check and renamed before the migration ran
  ([ADR 0004](0004-share-one-namespace-for-public-handles.md)).
- **The owner approves every write to Staging's and Production's databases,** as `AGENTS.md`
  says. A deploy that migrated would make every merge into `staging`, and every promotion, such a
  write.

## Considered

- **SERP's flow,** where each push migrates its environment's database and then deploys: no step
  between merging and serving, but no backup, bookmark or check before the write.
- **Migrating in the deploy job behind a GitHub environment that needs approval:** keeps the
  go-ahead, but the approval would hold the whole deploy, and the bookmark and checks would still
  need a person.

## Consequences

- A merged migration stops Staging's deploys until it is applied there, so it lands when someone
  can apply it soon after.
- Migrations are additive first: code that predates a migration never names what it adds, so it
  can be applied before the deploy that needs it. Removing something waits for a later release.
- A promotion that carries a migration deploys only once Production is migrated.
- Agents never apply one: `AGENTS.md` says to stop and ask, and the permissions ask before the
  migration scripts and every `--remote` command.
