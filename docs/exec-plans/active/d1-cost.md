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

- [ ] **Sitemaps: cache and stop scanning.** Serve index and shard XML from the Workers
  Cache API, keyed by the `sitemap_revisions` values the triggers already maintain,
  so a request reads about 3 rows and regenerates only after content changes. Make
  the shard-hash upsert conditional so a GET writes nothing. Target: index 41k to
  under 10 rows read, 8 to 0 rows written.
- [ ] **Run reconciliation: use the `template_id` index.** Make the planner use
  `idx_checklist_runs_template_id` (a composite `(template_id, status)` index, or a
  query shape that leads with `template_id`). Target: updating a template 26,685 to
  under 10 rows read.
- [ ] **Public profile templates: use the owner index.** Replace the `is_public` index
  with a partial index that matches public listings (see step 2), or order the
  filter so `idx_templates_owner` wins. Target: 7,005 to about 12.
- [ ] **Drop unused indexes** (one migration, verified with a code search per index):
  `idx_templates_slug`, `idx_templates_user_id`, `idx_templates_category`,
  `idx_checklist_runs_assigned_to_user_id`, `idx_audit_events_actor`,
  `idx_template_versions_subject`, plus the unused `usage_analytics` table. Saves one
  write per insert per index.

### 2. Bounded lists (API and UI changes)

- [ ] **Split the dashboard from the public catalog.** Signed-in dashboards query only
  the active owner (`idx_templates_owner`) instead of "public OR mine". Target: 19k to
  the user's own template count.
- [ ] **Paginate the public catalog.** Cursor pagination on `created_at` with a partial
  index `(created_at) WHERE is_public = 1 AND deleted_at IS NULL`, server-side category
  and search filters, and an edge cache for anonymous responses. Requires library UI
  changes. Target: 19k to about the page size.
- [ ] **Paginate run and template lists** (Personal, Organization, archived) with
  composite indexes that cover the filter and sort, for example
  `(team_id, deleted_at, created_at)` and a partial index for archived rows. Replace
  the per-run template subquery with one lookup for the page. Target: Organization runs
  10k to about the page size.

### 3. Writes

- [ ] **Audit only meaningful events.** Run progress ticks write an audit event (5 rows
  each). Keep lifecycle events (create, complete, share, delete) and drop per-tick
  audits, or coalesce them. Target: progress update 6 to 1 rows written.
- [ ] **Review sitemap trigger writes** once caching lands: about 5 extra writes per
  public template write.

### 4. Guardrails

- [ ] Run `PRAGMA optimize` after migrations only once step 1 lands, and re-profile,
  because statistics currently make the sitemap plans worse.
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
