# D1 Cost

D1 bills by **rows read** (rows the query *scans*, not rows it returns) and **rows
written** (including every index entry a write touches). A query that is harmless on
Postgres can read the whole table on every request. Source: the pricing section of
[cloudflare-d1-llms.txt](../references/cloudflare-d1-llms.txt).

| | Workers Free | Workers Paid |
| --- | --- | --- |
| Rows read | 5 million / day, then queries fail | 25 billion / month included, then $0.001 / million |
| Rows written | 100,000 / day, then queries fail | 50 million / month included, then $1.00 / million |

A written row costs 1,000 times a read row. On the Free plan the daily limits are an
availability risk, not just a cost: once they are exceeded, D1 rejects queries.

## Measuring

- **Per statement:** set `D1_PROFILE=true` and every statement logs a `d1_query` line
  with `rowsRead`, `rowsWritten`, `rowsReturned`, and `durationMs`
  (`functions/api/utils/d1-profiler.ts`, wired in `functions/api/db.ts`).
- **Per endpoint, at scale:** `pnpm run d1:profile` builds an isolated local D1 with
  about 150k synthetic rows (20k templates, 40k runs, 40k audit events), replays
  anonymous, Personal, and Organization requests, and writes
  `tmp/d1-profile/report.md` with rows read and written per request and per
  statement, efficiency (rows returned / rows read), and `EXPLAIN QUERY PLAN`. Use
  `-- --scale N` for more volume and `-- --reuse` to skip rebuilding. Local D1 reports
  rows read with production semantics.
- **Production:** `pnpm exec wrangler d1 insights serp-checklists-db --sort-by reads
  --time-period 31d --limit 25` (Cloudflare login required; analytics only).

## Rules for D1 queries

1. **Bound every list.** Use `LIMIT` with a cursor (`WHERE created_at < ?` on an index
   that matches the sort), never `OFFSET`: `OFFSET` reads every row it skips. On the
   catalog, page 200 read 10,400 rows with `OFFSET` and 88 with a cursor. A cursor only
   bounds the page when every filter has an index: `LIKE '%term%'` search, category
   matches inside JSON, and `COUNT(*)` totals still read every matching row.
2. **Match one index to the filter and the sort.** Use composite or partial indexes that
   cover `WHERE` and `ORDER BY` together. Avoid `OR` across different columns, and
   avoid single-column indexes on low-cardinality columns (`is_public`, `status`); the
   planner picks them and scans half the table. When such an index still beats a better
   one, write the term as ``sql`+${column} = 1` ``: unary `+` stops SQLite using an index
   for that term (the public profile query does this).
3. **Never write on a read path.** Make upserts conditional so an unchanged value writes
   nothing.
4. **Every index costs a write.** Each insert writes one row per index, and updates do
   the same for indexed columns they change. Drop unused indexes, and keep
   write-amplified tables (audit, history) lean.
5. **Cache public, anonymous responses** at the edge (the Cache API, per data center).
   Choose the invalidation by how often the content changes:
   - **Rarely, relative to reads:** key by a revision. Sitemaps use `cachedSitemap()`
     (`functions/sitemap/shared.ts`), keyed by the trigger-maintained
     `sitemap_revisions` and the bundled catalog, so a hit reads 3 rows and any content
     change or deploy misses.
   - **Often:** use a short TTL, so cost is bounded by the TTL rather than the edit
     rate. The anonymous catalog uses `withEdgeCache()`
     (`functions/api/utils/edge-cache.ts`) for 5 minutes: a hit reads nothing. So does
     the template lookup behind a template page's link-preview tags
     (`functions/seo/public-template-lookup.ts`), a single-row read by slug or id.

   Locally the cache persists in `.wrangler/state/v3/cache`; delete it to see
   uncommitted changes to cached responses.
6. **Check the plan after changing indexes.** Planner statistics (`PRAGMA optimize`) fix
   some plans and worsen others, so profile before and after.
7. **Request data only where it is shown.** Rows are billed per request, so a provider
   that loads a list on every route multiplies its cost by page views. Template lists
   load on demand ([FRONTEND.md](../FRONTEND.md)).

## Hotspots (2026-09-27)

Measured with `pnpm run d1:profile` at 20k templates and 40k runs, without planner
statistics (production has none). Production traffic today is tiny (the top 25
statements read about 104k rows in 31 days), so these are growth risks: each row
below grows linearly with the table.

Open, all unbounded lists:

| Request | Rows read | Cause |
| --- | --- | --- |
| Legacy template list (no `scope`) | 19,219 | Public *or* the user's own, unbounded and uncached; only tabs loaded before the scoped client (TD-15) |
| Public catalog cache miss (`GET /api/templates`) | 13,009 | Unbounded list of every public template; at most once per data center every 5 minutes, and 0 on a hit |
| Organization runs | 12,007 | Unbounded, plus a correlated template subquery per run; loaded only on the runs page |
| Organization templates | 3,007 | Unbounded |
| Personal and archived runs | about 1,000 each | Unbounded; archived filters `deleted_at IS NOT NULL` after reading every run |
| Sitemap cache miss | 41,449 (index), 19,419 (templates shard) | Builds every entry; now only after a content change or deploy, once per data center |

Everything else (session, detail pages, history, members, billing, run starts, template
updates, cached sitemaps) reads under 25 rows.

Fixed (rows read before, after; see the plan's progress):

| Request | Before | After | Fix |
| --- | --- | --- | --- |
| Update a template (run reconciliation) | 26,685 | 15 | `idx_checklist_runs_template_owner (template_id, team_id, user_id)`; dropped the `status` index the planner preferred |
| Start a run on the Free plan (active run count) | 26,676 | 6 | Same `status` index drop; the count now uses the owner index |
| Update an Organization template | 4,010 | 9 | Same composite index |
| Public profile templates | 7,005 | 12 | Unary `+` on `is_public`, so `idx_templates_owner` wins |
| Public catalog | 19,012 | 13,009 | `idx_templates_public_created_at (is_public, created_at)` also covers the sort |
| Repeat sitemap index / shard | 41,456 / 19,417 | 3 / 3 | Cache API keyed by sitemap revisions |
| Any page view (pricing, home, profiles, a run) | 26,018 anonymous, 38,438 signed in | 0 | The app fetched the catalog twice on every route; lists now load only on pages that show them, once |
| Repeat anonymous catalog | 13,009 | 0 | 5-minute edge cache |
| Signed-in catalog | 19,219 | 2 | `?scope=public` shares the anonymous edge cache (the 2 rows are the session) |
| Signed-in Personal template list | 19,219 | 609 for 200 templates | `?scope=personal` reads only the user's own templates through `idx_templates_owner` |
| Any signed-in page view (run list) | 1,007 Personal, 12,007 Organization | 0 | Runs load only on the runs page; the run page fetches one run by id |

Writes per request after step 1 (dropped `idx_templates_slug`, `idx_templates_user_id`,
`idx_templates_category`, `idx_checklist_runs_assigned_to_user_id`,
`idx_audit_events_actor`, and `idx_template_versions_subject`, none of which any query
used):

| Request | Rows written | Before | Cause |
| --- | --- | --- | --- |
| Create a public template | 18 | 23 | Template row plus 4 index entries, sitemap triggers, a version row, and an audit event |
| Start a run | 10 | 13 | Run row plus 5 index entries, and an audit event |
| Update run progress (each checkbox) | 5 | 6 | 1 run row and 4 for its audit event (row plus 3 indexes) |
| Sitemap index after a content change | 8 | 8 | Upserts the changed shard hashes; unchanged shards and cache hits write nothing |

Dropping an index on a foreign key column makes deleting a user scan that table. User
deletion already scans `templates` and `checklist_runs` for their unindexed
`created_by_user_id`-style columns, and it is rare, so the saved write on every insert
wins.

`PRAGMA optimize` (planner statistics) on the pre-step-1 data: updating a template
dropped to 3 rows read and public profile templates to 12, but the sitemap index rose to
65k and the template and category shards to 31k each. Re-check after the remaining
steps.

`usage_analytics` is neither read nor written by the app; dropping it deletes data, so
it needs a human decision.

The fixes, in order, are tracked in the [D1 cost plan](../exec-plans/active/d1-cost.md).
