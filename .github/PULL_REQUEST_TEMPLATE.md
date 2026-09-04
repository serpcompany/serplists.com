## Summary

<!-- Describe the outcome, the issue it resolves, and any user-visible impact. -->

## Verification

<!-- List the automated and manual checks run, with links to generated evidence where applicable. -->

## Database change record

Database impact:

- [ ] None — this pull request does not change or depend on database schema, migrations, data, bindings, guards, or deployment ordering.
- [ ] Yes — every field and check below is complete.

<!--
This section is mandatory for every pull request. Choose exactly one impact option.
If "None," briefly explain why below. If "Yes," follow
docs/agents/database-change-and-data-promotion.md and complete every field/check.
-->

None rationale or database-change details:

- Issue and migration:
- Classification: additive / backfill / destructive / irreversible
- Affected tables, columns, indexes, and environments:
- Compatible application versions and expand/migrate/contract phase:
- Expected row-count, ownership, deletion, JSON, version, and lifecycle impact:
- Fixture and production-shaped rehearsal plan:
- Rehearsal declaration ID, exact base/candidate range, affected tables, and required invariants:
- Recovery bookmark/export plan and restore target:
- Preflight, invariant, authenticated smoke, and teardown checks:
- Roll-forward and rollback triggers:
- Required owners and approval gates:
- Report artifact names, 90-day retention, and durable issue/PR links:

Database checklist (required when impact is **Yes**):

- [ ] I paired runtime Drizzle schema and Wrangler migration changes and generated `db/schema.sql` from a clean replay.
- [ ] I used the next numbered Wrangler SQL migration and did not use `drizzle-kit push` or `drizzle-kit migrate` to apply D1 changes.
- [ ] Fresh-chain, upgrade, invariant, authenticated API, and teardown checks pass with generated evidence.
- [ ] Production-shaped rehearsal and recovery-drill evidence is attached when required by classification.
- [ ] Repository workflows enforce staging migration/invariant/deploy order; I used no manual remote mutation path.
- [ ] I verified the external branch rules, protected environments, independent reviewer, scoped secrets, and Cloudflare credential isolation; unresolved external controls remain explicit production blockers.
- [ ] I made no production mutation or deployment as part of pull-request validation.
- [ ] Required independent owners reviewed the exact diff and evidence.
- [ ] I understand pull-request approval is not production approval; production requires a separate protected-environment approval event.

## Risk and rollback

<!-- State the main failure mode and the safe rollback or roll-forward action. -->
