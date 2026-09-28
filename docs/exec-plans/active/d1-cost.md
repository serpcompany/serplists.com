# D1 Cost

- **Status:** active
- **Last updated:** 2026-09-27
- **Goal:** keep D1 rows read per request bounded by what the request returns, not by
  table size, and cut write amplification. Findings and rules are in
  [D1 cost](../../design-docs/d1-cost.md).

Verify each step with `pnpm run d1:profile` (report numbers are at 20k templates and
40k runs, without planner statistics).

## Progress

- [x] Profiling: `D1_PROFILE` statement logging, `pnpm run d1:profile`, and a baseline
  of every major request and write path.

### 1. Quick wins (no API or UI changes)

- [x] **Sitemaps: cache and stop scanning.** `cachedSitemap()` serves the index and the
  database shards from the Cache API, keyed by `sitemap_revisions` and the bundled
  catalog. Repeat requests read 3 rows (from 41,456 and 19,417). The shard-hash upsert
  was already conditional: the index writes only when a shard changes (the 8 writes in
  the baseline were its first build), and cache hits write nothing.
- [x] **Run reconciliation: use a template index.** Migration 0026 replaces
  `idx_checklist_runs_template_id` with `idx_checklist_runs_template_owner
  (template_id, team_id, user_id)` and drops `idx_checklist_runs_status`. Updating a
  template: 26,685 to 15 rows read (Organization template: 4,010 to 9). The same drop
  fixes the Free-plan active run count on run start: 26,676 to 6.
- [x] **Public profile templates: use the owner index.** Unary `+` on `is_public` keeps
  the planner on `idx_templates_owner`: 7,005 to 12. `idx_templates_public` became
  `idx_templates_public_created_at (is_public, created_at)`, which also covers the
  catalog sort (19,012 to 13,009).
- [x] **Drop unused indexes:** `idx_templates_slug`, `idx_templates_user_id`,
  `idx_templates_category`, `idx_checklist_runs_assigned_to_user_id`,
  `idx_audit_events_actor`, `idx_template_versions_subject`. Rows written: create a
  public template 23 to 18, start a run 13 to 10, each progress update 6 to 5.
  `usage_analytics` stays until a human decides whether to delete its data.

### 1b. Stop requesting the catalog (no visible UI changes)

- [x] **Load template lists on demand.** `TemplatesProvider` fetched `GET /api/templates`
  twice on every route (26,018 rows read per anonymous page view, 38,438 signed in, at
  20k templates). Lists now load only on pages that call `useTemplateLists()`, the
  Personal list shares the catalog request, and nothing loads until the session and
  workspace are known. Pricing, home, profiles, and runs pages: 0 rows.
- [x] **Edge-cache the anonymous catalog** for 5 minutes with `withEdgeCache()`: a
  repeat request reads 0 rows (from 13,009).
- [x] **Load the run list on demand** the same way (`useTemplateLists({ runs: true })`,
  used only by the runs page); it loaded on every signed-in page (Organization runs:
  12,007 rows). The run page fetches its run by id.

### 2. Bounded lists (API and UI changes)

- [x] **Split the dashboard from the public catalog.** Signed-in pages request
  `?scope=public` (the shared edge-cached catalog: 2 rows read) and, separately,
  `?scope=personal` (only the user's templates through `idx_templates_owner`: 609 rows
  for 200 templates) instead of "public OR mine" (19,219). The UI merges the two as
  before; the user's own copy now wins over a cached catalog copy. The no-scope request
  stays for old tabs (TD-15).
- [x] **Stop template export reading the public catalog.** With "Include public
  community templates" on, `GET /api/templates/backup` OR-ed every public template into
  the owned query, uncached, on each click. It now reads only the active context's own
  templates; the page adds public ones from its edge-cached catalog.
- [ ] **Paginate the public catalog** once it is large enough that cache misses or the
  response size matter. Cursor pagination on `created_at` using
  `idx_templates_public_created_at` (never `OFFSET`), FTS5 for search, an indexed
  category table, a stored popularity score for the popular and trending sorts, and
  maintained category counts. Requires library UI changes. Target: 13k to about the page
  size.
- [ ] **Paginate run and template lists** (Personal, Organization, archived) with
  composite indexes that cover the filter and sort, for example
  `(team_id, deleted_at, created_at)` and a partial index for archived rows. Replace
  the per-run template subquery with one lookup for the page. Target: Organization runs
  12k to about the page size.

### 3. Writes

- [ ] **Audit only meaningful events.** Run progress ticks write an audit event (5 rows
  each). Keep lifecycle events (create, complete, share, delete) and drop per-tick
  audits, or coalesce them. Target: progress update 6 to 1 rows written.
- [ ] **Review sitemap trigger writes:** about 5 extra writes per public template write.

### 4. Guardrails

- [ ] Re-test `PRAGMA optimize` (statistics made the pre-step-1 sitemap plans worse) and
  run it after migrations if it no longer regresses any request.
- [ ] Add a rows-read budget to `d1:profile` (fail when a request exceeds its budget)
  and run it in the weekly maintenance workflow.
- [ ] Add production `wrangler d1 insights` output to the weekly maintenance report
  (needs a Cloudflare token with analytics read in CI).

## Decision log

- 2026-09-27: Profile locally on synthetic data instead of relying on production
  insights. Production volume is too small to show scaling problems (104k rows read in
  31 days across the top 25 statements), and local D1 reports rows read with the same
  semantics.
- 2026-09-27: Measure `.raw()` selects with a separate `.all()` in the profiler, because
  Drizzle runs most selects through `.raw()`, which returns no `meta`. Writes are never
  executed twice.
- 2026-09-27: Do not run `PRAGMA optimize` in production yet. It fixes the
  reconciliation and profile plans but makes the sitemap scans about 60% worse; fix the
  sitemaps first.
- 2026-09-27: Cache sitemaps with the Cache API rather than make their queries cheaper.
  Counting or paging public templates still scans them, so only a cache bounds a
  crawler's cost. Keys include `sitemap_revisions` (bumped by the sitemap triggers) and
  the bundled catalog (changes on deploys that touch sitemap code or official content),
  and leave out the query string. Lastmods that depend on columns the triggers ignore
  (such as `users.updated_at`) can lag by up to the 1-day `s-maxage`.
- 2026-09-27: Replace `idx_templates_public` with `(is_public, created_at)` instead of
  dropping it. Dropping it made every unbounded public list scan the table (catalog and
  dashboard 19k to 32k rows, sitemap misses 41k to 65k). A partial index on public rows
  helped the catalog but cannot serve the dashboard's `OR`. Step 2 revisits this once
  lists are bounded.
- 2026-09-27: Drop indexes on foreign key columns that no query filters on
  (`assigned_to_user_id`, `actor_user_id`). Deleting a user already scans `templates`
  and `checklist_runs` for other unindexed user columns and is rare; every insert paid
  for these indexes.
- 2026-09-27: Keep `usage_analytics`. It is unused, but dropping it deletes data, which
  needs a human decision; it receives no writes, so its indexes cost nothing.
- 2026-09-27: Cache the anonymous catalog with a 5-minute TTL, not a revision key.
  Public templates may be edited often, and a revision key would turn every save into a
  catalog-wide miss; a TTL bounds misses to one per data center per 5 minutes whatever
  the edit rate. Five minutes matches the client's existing `staleTime` for the catalog.
  Signed-in requests skip the cache because they return "public OR mine".
- 2026-09-27: Defer catalog pagination. Measured on 6k public templates: a cursor page
  reads 88 rows at any depth, but `OFFSET` page 200 reads 10,400, a rare search term
  reads 7,006 without FTS, and a total count reads 7,005. Pagination needs those pieces
  to pay off; the edge cache already makes most catalog views free.
- 2026-09-27: Wait for `isWorkspaceLoading` before loading any template list. Without
  it, signed-in pages fetched the list once as a visitor and again as the user, and
  Organization pages fetched the Personal list before the active Organization resolved.
- 2026-09-27: Add `scope=public|personal` to `GET /api/templates` instead of changing
  what the no-parameter request returns. Browser tabs opened before a deploy keep the
  old client, which reads the Personal list from the no-parameter request; changing it
  would hide their private templates until a reload. The old branch is TD-15.
- 2026-09-28: Build the public part of a template export in the page, from the catalog
  it already loaded, rather than splitting the API query or reading the edge cache in the
  export handler. The export page loads the catalog anyway, so this reads nothing extra.
  The API ignores `includePublic=1`: an old tab gets only its own templates until a
  reload, which is acceptable for an opt-in switch on a paid-only page.
- 2026-09-27: Share the edge-cached catalog between anonymous and signed-in requests
  (same key, since both are public only), and let the user's own templates override the
  catalog copy when merging, because the cached copy can be 5 minutes old. The smoke
  suite asserts that `?scope=public` never includes a private template.
- 2026-09-27: A review found two regressions from on-demand lists: starting a run on a
  directly opened template page failed ("Template not found"), and a run opened from
  the runs dashboard reverted saved toggles to the unrefreshed list copy (then 409s).
  `createRun` now takes the page's loaded template, and the run page always loads its
  own run by id. `tests/e2e/on-demand-lists.spec.ts` covers both; list pages take their
  loading state from their own queries; edge-cache keys name the resource, not the path.
