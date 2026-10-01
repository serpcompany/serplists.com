# Data Persistence

The persistence layer uses Cloudflare D1 for transactional data, the API in the app's Cloudflare Worker (`functions/api`, behind the route handler `src/app/api/[[...route]]/route.ts`) for access, Cloudflare R2 for uploads, and TanStack React Query for client-side caching.

## Related Files

- `functions/api/[[route]].ts` - API router.
- `functions/api/db.ts` - Drizzle D1 client.
- `functions/api/handlers/` - Auth, billing, Stripe, Templates, Runs, Organizations, admin, and uploads handlers; Organization handler filenames retain legacy `team` names.
- `functions/api/utils/session.ts` - Better Auth session lookup.
- `functions/api/utils/entitlements.ts` - Personal and Organization entitlement resolution.
- `functions/api/utils/team-access.ts` - Organization Membership and role authorization helpers; filename is legacy.
- `functions/api/utils/audit.ts` - Audit event value builder.
- `db/schema/` - Drizzle schema used by runtime queries.
- `db/schema.sql` - maintained reference snapshot for local inspection.
- `db/types/` - Drizzle model types.
- `db/migrations/*.sql` - D1 schema history.
- `db/seeds/` - local and official seed data.
- `db/maintenance/` - one-off maintenance SQL that is not schema history.
- `src/lib/api.ts` - Client API wrapper.
- `src/contexts/WorkspaceContext.tsx` - Personal/Organization context state; filename is legacy.
- `src/contexts/TemplatesContext.tsx` - Templates and runs with React Query.
- `src/lib/utils/templateBackup.ts` - Import/export helpers.
- `src/lib/repoTemplateCatalog.ts` - Repo-backed portable template catalog.
- `src/data/public-template-packs/*.json` - Repo-backed public template packs.

## Source Of Truth

Schema ownership, migrations, seeds, and environments are described in
[database operations](database-operations.md). The current tables and columns are
generated into [generated/db-schema.md](../generated/db-schema.md).

## Runtime access (Drizzle on D1)

`functions/api/db.ts` wraps the binding: `createDb(env)` returns
`drizzle(env.DB, { schema })` from `drizzle-orm/d1`, using `db/schema/index.ts`.
API responses stay snake_case to match the current frontend mapping, and JSON
columns are stored as text and parsed in handlers.

Handlers validate with a `SELECT` in an earlier round trip, and D1 runs each statement,
and each batch, as one transaction, so a write that depends on what was read re-checks
it in SQL, and a change that commits in between turns it into a no-op instead of a
partial write. `insertRowWhere` (`functions/api/utils/guarded-insert.ts`) writes
`INSERT INTO table (every column) SELECT values WHERE condition`: the row
`db.insert(table).values(values)` would write, each missing value filled the way Drizzle
fills it, but only while the condition holds. Plan limits put their count there, and a
companion row (a version, an audit event) is guarded on the new row existing
(`rowExistsSql`). `insertAuditEventWhere` and `insertAuditEventWhen` guard an audit row on
the condition of the write it records, batched before it, or on that write's effect,
batched after it (such as `updated_at` equal to this request's time), so a write that
did not happen records nothing. A guarded statement whose condition is false writes
nothing and the batch still commits; its result reports `meta.changes === 0`
(`batchWriteMissed`, `batchUpdateMissed`).

Drizzle names every column of a table in an `INSERT`, filling missing values with
defaults or `NULL`, so leaving a value out does not help when the database lacks the
column. Template reads and writes retry without `rules` when SQLite reports the column
missing (before the migration that adds it): `no such column: rules` in reads and
updates, `table templates has no column named rules` in an `INSERT` column list. The
retried insert drops the column from the statement itself (`withoutColumns`).

## Core Tables

- `users`: auth identity and profile data.
- `account`, `session`, `verification`: Better Auth persistence.
- `templates`: Template metadata, JSON content, visibility, Public Profile routing, Resource Owner scope, attribution, and soft-delete state.
- `checklist_runs`: Run state, progress, share fields, Resource Owner scope, assignment/actor attribution, and soft-delete state.
- `template_likes`: favorites.
- `usage_analytics`: product event log.
- `stripe_customers`, `stripe_subscriptions`, `stripe_webhook_events`: billing records and webhook idempotency.
- `entitlement_overrides`: user-level plan overrides.
- `teams`: legacy implementation table for Organization identity and billing/creator metadata.
- `team_members`: legacy implementation table for Organization Membership, role, and status.
- `team_invites`: legacy implementation table for hashed Organization invites and their lifecycle.
- `team_entitlement_overrides`: legacy implementation table for Organization-level plan overrides.
- `audit_events`: DB-backed actor/resource/action history.
- `template_versions`: point-in-time template snapshots.

## JSON Columns

- `templates.items`: sectioned template content.
- `templates.category`: JSON array of category strings.
- `templates.tags`: JSON array of tag strings.
- `templates.rules`: template rule metadata.
- `checklist_runs.items`: sectioned run content with completion state.
- `audit_events.before_json`, `after_json`, `diff_json`, `metadata_json`: structured audit payloads, kept small by `functions/api/utils/audit-compaction.ts`. Snapshots omit run and template content (`items`, `retired_items`) and share tokens; a diff's `items` records only the task ids that were completed, reopened, edited, added, or removed, or whose notes changed (never the notes text); each column is capped at 64 KB of UTF-8, with larger values replaced by a `{truncated, bytes, sha256}` marker. An audit row therefore can never push the write it shares a batch with past D1's 2,000,000-byte row limit. History lists never return `diff_json`, so the full copies that older rows still hold are never served. Run events written through MCP store only scalar run fields in `before`/`after` and an operation summary in `diff` (operation, task/subtask ids, progress and revision from/to, notes length), never copies of `items`, `retired_items`, or the share token.
- Audit rows record only writes that happened. Run and template writes guard their `UPDATE` (revision or version, owner scope, archive state), and a guarded `UPDATE` that loses a race matches no row without failing the batch. So each write inserts its audit row first, as `INSERT ... SELECT ... WHERE EXISTS` on the same condition (`auditedRunUpdate` in `functions/api/utils/checklist-runs.ts`; the template handlers do the same, and a template's version row and reconciled runs also require that audit row). A write that loses returns `409 edit_conflict`, or the not-found / not-archived answer a later request would get, and leaves no history.
- `template_versions.snapshot_json`: full template snapshot.
- History lists return each audit event's `metadata_json`, which names the Run Key
  behind an Agent's edit. A versioned template write records its audit event in the
  same batch with the same action and `created_at`, so template history gives each
  version the metadata of its event, found among the newest events read with the same
  limit, which hold the event of every version the Changelog shows (an older version, or
  one written before audit events, gets `null`). The template Changelog can then name the
  Run Key and label a Share (`functions/api/utils/history-queries.ts`): a save that changes
  only visibility records `{ visibility }` metadata (`visibilityChangeMetadata`), so the
  Changelog says "Made template public" without reading the diff.

## Resource Ownership

Personal data uses User ownership. Organization data uses Organization ownership.

- Personal templates: `templates.owner_type = 'user'`, `templates.user_id = current user`, `templates.team_id IS NULL`.
- Organization Templates: `templates.owner_type = 'team'`, `templates.team_id = active Organization`, with creator/updater attribution on User columns. The stored `team` values are legacy identifiers.
- Personal runs: `checklist_runs.user_id = current user`, `checklist_runs.team_id IS NULL`.
- Organization Runs: `checklist_runs.team_id = active Organization`, with creator/started/completed User attribution. `completed_by_user_id` and `completed_at` are written only when a run becomes completed (`functions/api/utils/run-completion.ts`), so a teammate's later save does not take over the completion: the run page sends the run's status with every save, so a rename, a tick or a note on a completed run arrives as `completed` again. Reopening keeps both stamps too; only revalidation clears them. A completion through a share link names nobody, so a reopened run does not keep its previous completer, and an already completed legacy row without a date gets one once, naming nobody. The handler decides from the status it read; the write's revision guard turns it into `409 edit_conflict` if another save changed the run in between, so the decision always matches the stored status.

Handlers must authorize Organization access before returning or mutating Organization-scoped rows. Do not trust the legacy client-supplied `teamId` without checking Organization Membership and role.

## API Access

Client requests go through `src/lib/api.ts`, which uses:

- `/api` on the page's own origin, in development and in deployed environments, unless
  `NEXT_PUBLIC_API_URL` names another API. `src/lib/apiBaseUrl.ts` resolves the base for
  both `api.ts` and the Better Auth client, and ignores a loopback `NEXT_PUBLIC_API_URL`
  unless the page is served from a loopback host.
- Better Auth cookies for session state.

Main server handlers:

- `functions/api/handlers/auth.ts`
- `functions/api/handlers/billing.ts`
- `functions/api/handlers/stripe.ts`
- `functions/api/handlers/templates.ts`
- `functions/api/handlers/checklists.ts`
- `functions/api/handlers/checklists-shared.ts` (the `/share/:token/` guest route)
- `functions/api/handlers/teams.ts`
- `functions/api/handlers/admin.ts`
- `functions/api/handlers/uploads.ts`

## Caching And Invalidations

`src/contexts/TemplatesContext.tsx` uses TanStack React Query for Templates and Runs. Query keys include ownership context so Personal and Organization data do not bleed together. Context switching invalidates Template and Run queries.

History queries (the run and Template Changelogs) take their keys from `src/lib/queryCache.ts`, which also holds the history refreshes; the list refreshes that call them after each save are in `src/contexts/templateListCache.ts`. Every save writes an audit event:

- The run page refreshes the run Changelog once its save queue is idle after a save, not once per click (each refetch reads D1). Revalidating a run, and Share or Stop sharing on the runs list, refresh it too.
- A Template Changelog key sits under `['templates']`, so every Template list invalidation (Share, visibility, archive, restore, a context switch) refreshes it. Saving a Template in the editor also refreshes every cached Changelog of that Template, whatever user or Organization loaded it. Archiving a Template marks its Changelog and detail entries stale without refetching them, since the template is gone (`markArchivedTemplateStale`).
- Sharing a run (from the runs list or the run page) marks it public in every cached runs list as soon as the API returns, before the link is copied, then reloads the lists. A shared run cannot be revalidated, so its row stops offering Revalidate. A revalidate refused because the cached copy is stale (`409 edit_conflict` or `shared_run_conflict`, or a `404`) reloads the runs lists too; a `404 source_template_unavailable` means the run is still there but its template is not usable any more, so the reloaded row stops offering Revalidate. A `404` on Archive, Share or Stop sharing for a run, or on Archive or Start Run for a template, means it was archived elsewhere while the cached list still showed it: the Run or Template lists reload before the error shows (`refreshRunsAfterConflict`, `refreshTemplatesAfterConflict` in `src/contexts/templateListCache.ts`), and the cached public catalog drops the template instead of refetching its edge copy.

Organization lists are fetched by the legacy-named `WorkspaceContext` and keyed by current User ID.

Billing query keys are also user-scoped. A session change must not reuse another
user's cached entitlement response, and the UI should show a neutral loading
state until the current user's plan is known.

Invites, Organization members and activity, Run Keys, and archive lists use the
user-scoped keys from `src/lib/queryKeys.ts`. When the signed-in user changes (sign-out,
or a sign-in as someone else in the same tab), `AuthProvider` removes every cached query
that no mounted page reads, except the shared public catalog, so nothing the previous
user loaded is shown to or refetched for the next one.

## Stable ids and run reconciliation

Sections, tasks and Sub-tasks keep their ids across saves, and a run's state follows
them. The rules people see are in [features](../product-specs/features.md), and the
storage contract and what counts as a structure change are in the
[portable template spec](../product-specs/portable-templates.md#storage-strategy-d1). The
API applies them like this:

- **Ids on write.** `assignMissingStableTemplateIdentities`
  (`functions/api/utils/template-identities.ts`) gives a record without a usable id one
  matched to the content it replaces, so run state follows it: the same id first, then
  the only previous sibling with the same title (when the title is unique and that sibling
  had no stored id), then the previous sibling at the same position (when it had none),
  and otherwise its own id or a positional `legacy-*` id.
- **Ids on read.** Readers get stored content with the ids a save of it would store
  (`withStableTemplateIdentities`), so an editor that sends it back keeps every id, and a
  run started from it matches its Template. Unlike the identity pass, entries that are not
  objects stay where they are, for the readers that show them. Import refuses such an entry
  instead (`findNonObjectTemplateEntry`): the identity pass would silently drop it, and a
  client that spread a string into a record would store its characters as keys on an
  untitled task.
- **Matching a run.** `reconcileRunSections`
  (`functions/api/utils/template-reconciliation.ts`) matches each Template task and
  Sub-task to the run's previous copy by id. Ids are unique across a Template, so work that
  moved to another section or task is still the same work. Every copy under its own parent
  is matched first (legacy runs repeat ids across sections), before any is looked for
  elsewhere, so the result does not depend on which way work moved; then the only copy
  anywhere in the run is taken, and an id the run holds more than once is never guessed.
  Work an earlier reconcile retired comes back with its state when the Template brings its
  id back (restoring an older version, say), the newest retired copy first, but only for
  an id the run no longer holds anywhere, so a stale retired copy never replaces live
  state.
- **Retiring.** Previous work nothing in the Template matched joins `retired_items` after
  the earlier entries. A retired task leaves out the Sub-tasks that moved to another task,
  and a removed section leaves out the work that moved elsewhere and is not retired at all
  when every task it had moved.
- **Legacy state.** Runs saved before `isCompleted` existed store `completed`, which
  reconciliation and the completion rule read the way the client does; a new run drops it
  (`resetRunCompletionState`).

## Import/Export

Template backup and portable import/export are implemented through `src/lib/utils/templateBackup.ts` and the Template backup API routes. Organization imports/exports pass the legacy `teamId` parameter so imported Templates land in the selected Organization when authorized.

The portable contract is shared by uploaded files and repo-backed public packs.
Repo packs live in `src/data/public-template-packs/*.json` and are normalized by
the same validation path as uploaded packs. Public URLs are
`/profile/<owner>/<slug>/`, so the public catalog merges a repo entry and a D1
template only when both the owner and the slug match (an official `serp` copy of a
starter, where the repo entry wins); another owner's template with the same slug
stays listed. The API also treats every bundled starter slug as taken
(`functions/api/utils/reserved-template-slugs.ts`): starters live in the app bundle,
where the D1 unique index cannot see them, and their slugs come from the generated
sitemap catalog, which every build regenerates from the packs, so a new starter is
reserved without a code change. It treats every UUID as taken too, since the template page and its
server-rendered metadata read
`/profile/<owner>/<uuid>/` as a template id first: create, import, clone and a slug
change get the `-<id8>` suffix instead, while a Template that already holds such a
slug keeps it (a UUID the id lookup does not match is then tried as a slug). A new
template's slug is picked by reading first, so a concurrent write can claim it before
the batch runs; `idx_templates_slug_unique` then fails the batch, which D1 rolls back
whole, and the insert is retried with a random suffix, its version snapshot and audit
event (which carry the slug too) rebuilt, up to 3 attempts before `409 slug_taken`
(`functions/api/utils/template-insert.ts`). Repo templates are dated
by their pack's `exportedAt` (a fixed fallback date when it is missing or invalid,
never the page-load time), which drives the library's Recent sort and their
published date, so bump `exportedAt` when a pack's content changes. Saving a repo
template creates a private D1 template with a slug derived from its title;
starting a run uses its normalized sections and does not require a source D1 row.

Create and update saves are awaitable end to end. UI success and navigation
must wait for confirmed persistence, and update flows must preserve existing
portable metadata such as `rules` when it is not being edited.

See the [portable template spec](../product-specs/portable-templates.md) for versioning, metadata
round-trip, and structured import-result contracts.

## Shared-run links

Sharing is run-scoped. Each share action (`POST /api/checklists/run/:id/share`)
mints a fresh token for the run and replaces its previous one, so the older guest
link stops working. `DELETE /api/checklists/run/:id/share` stops sharing: one
guarded update clears `is_public` and every share field, and the
`checklist_run.share_revoked` audit row is written only if the run was still
shared. It leaves the run's revision, tasks, and progress unchanged, so open run
pages keep saving. Archiving and restoring a run also clear its share fields.
Sharing never creates a run, and a shared run in progress counts toward the
active-run limit like any other (the old `POST /api/checklists/:templateId/share`
route, which created public runs outside that count, is gone and returns `404`).
The public guest URL is `/share/:token/`. Guest saves never replace the run's
structure: the server copies only completion and notes from the payload onto the
stored sections, matched by the ids the share page uses (the stored ids, or positions
such as `1` and `1-1` where an id is missing). A stored entry the payload leaves out
keeps its state, and an unknown id is ignored. A Sub-task matches by its id when that id
is unique within the task, and otherwise by its position in the same list, only when the
guest's entry carries the same id or none. The share page sends back stored values it
does not normalize, so a save checks notes and Sub-task shapes where it uses them rather
than failing whole. When sharing fails, distinguish an
entitlement `limit_reached` response from schema/migration failures before
changing sharing logic.

Because each share mints a new token, the UI treats creating the link and copying it
as separate steps (`src/lib/shareLink.ts`). The created link is always shown in a
dialog (`ShareLinkDialog`), copying is best effort through `copyTextToClipboard`
(Safari refuses a clipboard write that follows a network request), and an error is
reported only when the API call fails. Reopening the dialog for the same run reuses
the link instead of minting another token, but only while the page shows the run
shared. Once the runs list (after a refetch) or the run page (after it reloads the run)
shows the run private or no longer lists it, the link is forgotten and the next Share
mints a new one: another tab or an Organization teammate stopped sharing it, which
killed the link. A Share made elsewhere replaces the token while the run stays shared,
which the page cannot see because run reads never return share tokens; the reused link
is then dead until the page is reloaded. ESLint bans direct `navigator.clipboard`
access outside `src/lib/clipboard.ts`.

## Seeds

`pnpm run db:seed` seeds local D1 with dev Users, sample Personal data, Organization data and memberships, pending invites, entitlement overrides, and official public Templates. Seed identifiers retain legacy `team` names.

Use `pnpm run db:seed:official:staging` for staging official templates only. Do not seed test users into production.
