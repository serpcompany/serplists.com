# Run Provenance

- **Status:** completed
- **Last updated:** 2026-10-04
- **Goal:** a Run shows who owns it, which Template version it came from, who created,
  started, was assigned and completed it, and whether it came from the web app or an agent
  through a Run Key (issue #202), from data the database already stores. No migration.

## Current state (2026-10-04, before PR 1)

- Run responses are raw `checklist_runs` rows (`serializeChecklistRun` in
  `functions/api/utils/checklist-runs.ts`); the client schema (`src/lib/schemas/apiRuns.ts`)
  has no actor fields.
- The columns exist: `created_by_user_id`, `started_by_user_id`, `assigned_to_user_id` (nothing
  writes it), `completed_by_user_id`, `template_version`, `revision`, and the timestamps.
- A Run created through MCP writes its `checklist_run.created` audit event with
  `metadata: { source: "mcp", personalRunKeyId, personalRunKeyName }`, the key's owner as the
  actor. A Run created in the web app writes the same event with no `source`.
- `public_share` marks updates made through a share link, never a creation, so a Run's origin
  is the web app, MCP, or unknown.
- The Run and Template pages call their history "Changelog" and show the latest 8 entries.

## Progress

- [x] PR 1: the provenance contract (#271, merged 2026-10-04). Web-created Runs record `source: "web"`; the runs list
  answers each Run's `provenance: { origin, startedBy }`, and one Run's read answers the full
  provenance; the client schema accepts both; tests and the rows-read budgets. No UI change.
- [x] PR 2: My Runs as a table on desktop (Run, Template, Status, Progress, Started by, Origin,
  Started, Updated, actions; the cards stay on phones) and the Run page header with its
  provenance line and Show Details (#272, merged 2026-10-04).
- [x] PR 3: "Changelog" becomes "Activity" on the Run and Template pages, with a View all path
  instead of the fixed 8 entries (#273, merged 2026-10-04).
- [ ] Follow-up, not planned: clearer Activity labels where an event's structured diff makes them
  reliable, which the issue allowed but did not require.

## Decision log

- 2026-10-04: Three PRs, not the issue's two, so each stays small to review (owner decision).
- 2026-10-04: "Changelog" becomes "Activity" on both the Run and the Template page, so the
  product has one word for history (owner decision).
- 2026-10-04: Origins read "Web", "MCP" and "Unknown", the issue's labels (owner decision).
- 2026-10-04: The runs list carries only the origin and who started each Run, the two
  provenance columns its table shows; one Run's read carries everything (owner, Template
  title and version, created, started, assigned and completed by, the Run Key's name and who
  authorized it). The list is unbounded by design today, so every extra join per Run
  multiplies its rows read ([D1 cost](../../design-docs/d1-cost.md)); one Run's read pays them
  once.
- 2026-10-04: The origin comes from the Run's first audit event, read through
  `idx_audit_events_resource` in created order, so it costs one index entry per Run. A
  `checklist_run.created` event with `source: "web"` or `"mcp"` names it; anything else,
  including older web Runs whose event has no `source`, is `unknown`, never a guess.
- 2026-10-04: An actor is `{ userId, name, username }`, no email: the Run page needs a name to
  show, and the history endpoint stays the only place that answers emails.
- 2026-10-04: The synthetic dataset gives every run its starter and a creation audit event, as
  real runs have, so the rows-read budgets measure the list's provenance lookups instead of
  probing for rows that do not exist. The Organization run list went from 3 to 5 rows per run
  and a run by id from 6 to 12.
- 2026-10-04: My Runs renders the table from 90rem (1440px) and the cards below it, choosing
  one with `useMediaQuery` rather than hiding one with CSS, so the page holds each Run's links
  once. At `xl` (1280px) nine columns pushed the row's actions out of view; from 90rem they
  fit, with Run and Template titles clamped to two lines and Revalidate and Stop sharing as
  icon buttons named by their labels. The cards and the table share their
  badges, progress and actions (`src/components/dashboard/RunRowParts.tsx`).
- 2026-10-04: "View all activity" loads the latest 100 entries, the history API's most
  (`HISTORY_FULL_LIMIT`, which the API now reads from `src/lib/schemas/historyLimits.ts`), in place of the
  fixed 8, and says so when it reaches 100. Paging further back needs a cursor the history
  endpoints do not have. There is no Activity tab, so there is no panel state to deep-link.
- 2026-10-04: Every column in the provenance subqueries is written table-qualified. Drizzle
  renders a select field's top-level column references unqualified, so the first version's
  `audit_events.resource_id = checklist_runs.id` rendered as `"resource_id" = "id"` and
  compared each audit row with its own id; the integration test caught it.
