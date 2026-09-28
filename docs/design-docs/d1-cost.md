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

1. **Bound every list.** Use `LIMIT` with a cursor. An unbounded list reads the whole
   matching set, and its cost grows with the table.
2. **Match one index to the filter and the sort.** Use composite or partial indexes that
   cover `WHERE` and `ORDER BY` together. Avoid `OR` across different columns, and
   avoid single-column indexes on low-cardinality columns (`is_public`, `status`); the
   planner picks them and scans half the table.
3. **Never write on a read path.** Make upserts conditional so an unchanged value writes
   nothing.
4. **Every index costs a write.** Each insert writes one row per index, and updates do
   the same for indexed columns they change. Drop unused indexes, and keep
   write-amplified tables (audit, history) lean.
5. **Cache public, anonymous responses** at the edge. A cache hit reads nothing.
6. **Check the plan after changing indexes.** Planner statistics (`PRAGMA optimize`) fix
   some plans and worsen others, so profile before and after.

## Hotspots (2026-09-27)

Measured with `pnpm run d1:profile` at 20k templates and 40k runs, without planner
statistics (production has none). Production traffic today is tiny (the top 25
statements read about 104k rows in 31 days), so these are growth risks: each row
below grows linearly with the table.

| Request | Rows read | Cause |
| --- | --- | --- |
| Sitemap index | 41,449 | Loads every public template and user in memory to compute shard `lastmod`s |
| Update a template | 26,685 | Run reconciliation picks the `status` index and scans all in-progress runs (the `template_id` index exists but is not chosen) |
| Sitemap templates shard | 19,417 | Loads every entry, then slices one page |
| Signed-in dashboard templates | 19,219 | One query returns all public templates *or* the user's own, unbounded |
| Sitemap categories shard | 19,025 | Scans all public templates |
| Public catalog (`GET /api/templates`) | 19,012 | Unbounded list of every public template, sorted in a temporary B-tree |
| Organization runs | 10,407 | Unbounded, plus a correlated template subquery per run |
| Public profile templates | 7,005 | Picks the `is_public` index instead of the owner index |
| Organization templates | 3,007 | Unbounded |
| Sitemap profiles shard | 3,008 | Scans users |
| Personal and archived runs | about 1,000 each | Unbounded; archived filters `deleted_at IS NOT NULL` after reading every run |

Everything else (session, detail pages, history, members, billing) reads under 20 rows.

Writes per request:

| Request | Rows written | Cause |
| --- | --- | --- |
| Create a public template | 23 | Template row plus 8 index entries, sitemap triggers, a version row, and an audit event |
| Start a run | 13 | Run row plus 7 index entries, and an audit event |
| Update run progress (each checkbox) | 6 | 1 run row and 5 for its audit event (row plus 4 indexes) |
| Sitemap index (a GET) | 8 | Upserts shard hashes on every request, even when unchanged |

`PRAGMA optimize` (planner statistics) on the same data: updating a template dropped to
3 rows read and public profile templates to 12, but the sitemap index rose to 65k and
the template and category shards to 31k each.

Unused by the profiled workload and by any code filter: `idx_templates_slug` (duplicates
`idx_templates_slug_unique`), `idx_templates_user_id` (every filter pairs `user_id` with
`owner_type`, covered by `idx_templates_owner`), `idx_templates_category` (categories
are JSON arrays), `idx_checklist_runs_assigned_to_user_id`, `idx_audit_events_actor`,
and `idx_template_versions_subject`. `usage_analytics` is neither read nor written by
the app.

The fixes, in order, are tracked in the [D1 cost plan](../exec-plans/active/d1-cost.md).
