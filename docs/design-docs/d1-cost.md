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
  (`functions/api/utils/d1-profiler.ts`, wired in `functions/api/db.ts`). Never enable
  it in production: Drizzle runs most selects through `.raw()`, which returns no
  `meta`, so the profiler measures `.raw()` and `.first()` reads with an extra `.all()`
  of the same statement, doubling their cost. A read still returns `.raw()`'s own rows,
  which keep duplicate column names that `.all()` merges; a write runs once, its rows
  converted from that one `.all()`.
- **Per endpoint, at scale:** `pnpm run d1:profile` builds the app with OpenNext and an
  isolated local D1 (`.wrangler/d1-profile-state`) with about 150k synthetic rows (20k
  templates, 40k runs, 40k audit events, 5k invites), serves the build with
  `opennextjs-cloudflare preview` and `D1_PROFILE=true`, replays anonymous (public pages
  included), Personal, and Organization requests, and writes `tmp/d1-profile/report.md`
  with rows read and written per request and per statement, efficiency (rows returned /
  rows read), and `EXPLAIN QUERY PLAN`. Local D1 reports rows read with production
  semantics.
  - **The workload** (`scripts/d1-profile-lib.ts`) requests each public page twice, in its
    canonical form: the first visit measures the lookups its server render makes for its
    `<head>`, the repeat an edge-cache hit. It also asks for sitemap pages the index never
    published, to measure the 404 guard. Every request declares its expected status; one
    that returns anything else measured an error path, so the report marks it `INVALID`
    and the command exits 1.
  - **The dataset** (`scripts/d1-profile-dataset.ts`) gives every 20th template to the
    seeded Organization and every 50th to `admin@test.com`, so the signed-in requests read
    realistic volumes of their own data, and gives the profiled template and run 300
    history entries each, so history reads are measured on a heavily edited one. Every run
    has its starter and a `checklist_run.created` audit event (every fifth from MCP), as real
    runs do, so the runs lists measure their provenance lookups. Its
    invites are expired or revoked invites for other emails, which the incoming-invites
    lookup must skip through the email index.
  - **Reuse:** `-- --scale N` adds volume, and `-- --reuse` reuses the dataset instead of
    rebuilding it. The app is built every time: the build bundles the API, so an older
    build would measure older queries. Each new dataset is copied to
    `.wrangler/d1-profile-pristine` before the server opens its SQLite files, with the
    copy's `meta.json` written last, so an interrupted copy is never restored. `--reuse`
    restores that copy, so the workload's writes (new Runs, the template updates, john's
    Free-plan run count) never carry over into the next run. It rebuilds when the snapshot
    is missing or was built at another scale or from other migrations, local seed
    (`db/seeds/local.ts` and `db/seeds/local-test-data/`) or synthetic data.
- **Budgets, in CI:** `tests/integration/rows-read-budgets-local-d1.test.ts` fails when a
  hot request reads more rows than its budget. It runs in `pnpm run test:local-d1`, which CI
  runs in its D1 integration step.
  - It starts local D1 with `startLocalD1()`, applies the local seed and the synthetic dataset
    at a small scale (`buildSyntheticSql(datasetCounts(0.02))`: 400 templates, 800 runs and a
    few hundred rows in each other table), and signs in the seeded users. It sends each
    request through the API router, and the sitemaps and page lookups through their
    functions, and sums `rowsRead` with `withD1Profiling()` wrapped around the env's `DB`.
    Outside the Workers runtime there is no edge cache, so a cached request measures its miss.
  - One table in the test holds every budget with its reason. A bounded request (an index
    lookup, a `LIMIT`) gets a constant budget: the rows it read plus 10% or 2 rows, whichever
    is more. A request that is unbounded by design today (the hotspots below) gets a budget
    that grows with the seeded rows it must read (every public Template, the user's runs, an
    Organization's runs), plus the same margin on what it reads beyond them, and its test name
    says it is unbounded until the [D1 cost plan](../exec-plans/active/d1-cost.md) bounds it.
  - The budgets bite: dropping `idx_templates_public_created_at` fails the catalog, the lists
    without a scope and both sitemaps; reading every template version instead of the newest
    50 fails the template history; dropping `idx_checklist_runs_template_owner` fails both
    template updates.
  - **Updating a budget.** When a change is meant to read more rows (or fewer), check its plan
    with `pnpm run d1:profile`, run the file alone
    (`pnpm exec vitest run tests/integration/rows-read-budgets-local-d1.test.ts --testTimeout=20000 --maxWorkers=1`),
    and set the route's `bounded()` value, or its `unbounded()` rows and the rows it reads
    beyond them, to the measured rows the failure names, with the reason. Only a request whose
    plan reads rows in proportion to a table belongs in `unbounded()`. A new hot request gets a
    row in the same table.
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
   for that term. The public profile query does this, and
   `tests/unit/functions/api/history-query-plan.test.ts` fails if its plan goes back to the
   `is_public` index. Never wrap an indexed column in a function: `lower(email) = ?`
   cannot use the email index and reads the whole table. Normalize on write and compare
   with plain equality (invite emails are lowercased by the create-invite Zod schema, so
   incoming invites match `email = ?`). The pending-invite reads that revoke a member's
   invites (`functions/api/utils/team-invite-revocation.ts`) read one Organization's
   invites through the `(team_id, email)` index prefix, so the one by the member's email
   can compare `lower(email)`: it only filters that Organization's rows, and it still
   matches legacy rows stored in mixed case.
3. **Never write on a read path.** Make upserts conditional so an unchanged value writes
   nothing.
4. **Every index costs a write.** Each insert writes one row per index, and updates do
   the same for indexed columns they change. Drop unused indexes, and keep
   write-amplified tables (audit, history) lean. Migration `0026` dropped
   `idx_templates_user_id` and `idx_templates_slug`, which `idx_templates_owner` and
   `idx_templates_slug_unique` cover, and `idx_audit_events_actor` and
   `idx_template_versions_subject`: no query filters audit events by actor or template
   versions by subject.
5. **Cache public, anonymous responses** at the edge (the Cache API, per data center).
   Choose the invalidation by how often the content changes:
   - **Rarely, relative to reads:** key by a revision. Sitemaps use `cachedSitemap()`
     (`functions/sitemap/cache.ts`), keyed by the bundled catalog and the
     trigger-maintained `sitemap_revisions` kinds each sitemap depends on, so a hit reads
     3 rows and a change to what that sitemap lists misses, as does a deploy that changes
     sitemap code (the files in `SITEMAP_IMPLEMENTATION_SOURCES`,
     `scripts/lib/sitemapLastmod.ts`, which a unit test keeps in step with the sitemap
     imports). Each shard depends only on its own kind (a sign-up or avatar change bumps
     only `profiles`, so the templates and categories shards stay cached); the index
     depends on all three.
     The triggers must bump a family's kind whenever its inputs change: the dependency
     table in [SEO and sitemaps](seo-and-sitemaps.md#caching) and
     `tests/unit/functions/sitemap-migrations.test.ts` record which. A key that the caller controls (such as a page number)
     must be bounded before the cache, or every new value is a miss: shard pages above
     1 that the index never published (no `sitemap_shard_revisions` row) get an uncached
     404 after a 1-row primary-key read, and page numbers above 50,000 read nothing.
     Build the key from the parsed route values, never the request path: the shard
     routes accept the page file in any letter case and with leading zeros, so `1.XML`
     and `01.xml` reach the same shard, and `cachedSitemap()` keys both as
     `/sitemaps/<kind>/1.xml`.
   - **Often:** use a short TTL, so cost is bounded by the TTL rather than the edit
     rate. The anonymous catalog uses `withEdgeCache()`
     (`functions/api/utils/edge-cache.ts`) for 5 minutes, the template lists' client
     `staleTime`: a hit reads nothing. Its cache key names the response shape
     (`/api/templates?scope=public&fields=public-with-owner`), so a deploy that changes the shape
     misses rather than serving the old one. So do the
     lookups behind the public pages' server-rendered metadata (docs/FRONTEND.md), which
     run on every visit: the template page's single-row read by slug or id
     (`functions/seo/public-template-lookup.ts`; a UUID that matches no public id reads
     one more row, by slug), a found profile's name and summary, and the category
     counts, which are computed from the cached catalog (`src/server/pageMeta/`). Only a
     found template or profile is cached, so a new one is named at once. The share
     page's title is one indexed read (`functions/seo/shared-run-lookup.ts`), not cached.

   Either way, cache only a response that is identical for every visitor, and name its
   key in code (`withEdgeCache(request, keyPath, ...)`, `cachedSitemap()`), never take it
   from the request URL, so path and query-string variants of a resource cannot bypass
   the cache. Outside the Workers runtime (`next dev`, unit tests) there is no cache, and
   every request builds its response. Locally the cache persists in
   `.wrangler/state/v3/cache`; delete it to see uncommitted changes to cached responses.
6. **Check the plan after changing indexes.** Planner statistics (`PRAGMA optimize`) fix
   some plans and worsen others, so profile before and after.
7. **Request data only where it is shown.** Rows are billed per request, so a provider
   that loads a list on every route multiplies its cost by page views. Template lists
   load on demand ([FRONTEND.md](../FRONTEND.md)). The same goes for columns and
   limits: the Activity cards ask for `HISTORY_DISPLAY_LIMIT` (8) entries
   (`src/lib/schemas/historyLimits.ts`), history lists never return audit `diff_json` (a template or
   run update diff holds the whole template or run), and template history reads the
   newest `LIMIT` versions and the newest `LIMIT` audit events (archive, restore and a
   Share's visibility are recorded only as events). Each read stops at `LIMIT` on its
   index: versions order by `version` on the unique `(template_id, version)` index
   (ordering by `created_at` would read and sort every version first), and
   events by `created_at` on `idx_audit_events_resource`
   (`functions/api/utils/history-queries.ts`, plans checked by
   `tests/unit/functions/api/history-query-plan.test.ts`).

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
| Organization runs | 20,008 (12,007 before run provenance) | Unbounded, plus a correlated template subquery, the starter and the first audit event per run (5 rows per run); loaded only on the runs page |
| Organization templates | 3,007 | Unbounded |
| Personal and archived runs | about 1,000 each | Unbounded; archived filters `deleted_at IS NOT NULL` after reading every run |
| Sitemap cache miss | 41,449 (index), 19,419 (templates shard) | Builds every entry; now only after a deploy or a change to what that sitemap lists, once per data center, and only for pages the index published |

Every Template list and detail read also joins the owning Organization by primary key for
an Organization Template, and reads nothing more for a Personal one (`selectTemplatesWithOwner`
in `functions/api/utils/template-rows.ts`, [data persistence](data-persistence.md#resource-ownership)).
That adds one row per Organization Template: the Organization template list's budget went
from 3 to 4 rows per Template on 2026-10-02. Each listed run also reads its starter by primary key and its
first audit event through `idx_audit_events_resource` for its provenance (origin and who
started it), and one run's read its whole provenance: the Organization run list's budget went
from 3 to 5 rows per run, and a run by id from 6 to 12 rows, on 2026-10-04
([run provenance](../exec-plans/active/run-provenance.md)). A public Organization Template adds one row to a
catalog miss too, although public responses drop the Organization's name and slug.

Everything else (session, detail pages, history, members, billing, run starts, template
updates, cached sitemaps) reads under 25 rows. The seed has about one audit event per
run, so the profile understates history: every progress save writes an event, and an
unlimited `/history` read returns the API's default of 50 events and their users. The
run page shows 8 and asks for `?limit=8` (`RUN_HISTORY_PREVIEW_LIMIT`), so it reads at
most 8 events and 8 users.

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
| Open a template detail page (template list) | 609 for 200 Personal templates, 3,007 Organization, plus the template by id | The template by id only (under 25) | The page fetches its template by id instead of loading the workspace list; edits refetch that one template, not the list |

Template export (`GET /api/templates/backup`) reads only the active context's own
templates through the owner indexes. With "Include public community templates" on, it
used to OR every public template into that query, uncached, on each click (the whole
catalog, like a catalog cache miss). The page now adds public templates from the
edge-cached catalog it already loaded (`src/lib/templates/portableExport.ts`), and the
API ignores `includePublic=1` from older tabs.

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
