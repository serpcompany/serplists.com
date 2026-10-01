# SEO and Sitemaps

How search engines and link previews find the public pages: the XML sitemaps
(`functions/sitemap/`) and the lookups behind the public pages' server-rendered metadata
(`src/server/pageMeta/` and `functions/seo/`). The route handlers in `src/app/sitemap.xml`
and `src/app/sitemaps` only hand these modules the request, the Worker's bindings and
`waitUntil` (`getSitemapContext` in `src/server/sitemapContext.ts`). Page titles,
robots rules and environments are in [FRONTEND.md](../FRONTEND.md#page-titles-and-meta-tags),
and what the sitemaps cost in D1 is in [D1 cost](d1-cost.md#rules-for-d1-queries).

## Sitemap URLs

| URL | Lists |
| --- | --- |
| `/sitemap.xml` | Every shard below, each with its last change |
| `/sitemaps/pages/<n>.xml` | The static pages, from the bundled catalog |
| `/sitemaps/categories/<n>.xml` | `/categories/` and every category in use |
| `/sitemaps/profiles/<n>.xml` | Every profile with a valid username |
| `/sitemaps/templates/<n>.xml` | `/templates/`, the bundled starters and every public Template |
| `/sitemaps/static.xml`, `/categories/sitemap.xml` | The sitemaps from before the shards: a permanent redirect (`308`) to page `?page=` (1 by default) of the pages or categories shard on `https://serplists.com` |

- A shard holds up to 25,000 entries (`SITEMAP_PAGE_SIZE` in `functions/sitemap/shared.ts`).
  A sitemap index lists at most 50,000 sitemaps, so no page above 50,000 is ever published:
  such a page is refused before anything is read, which also keeps its row offset a safe
  integer.
- A page file is `<n>.xml` in any letter case (`shardPageParam`); any other name is a `404`.
- Every `<loc>` names `https://serplists.com` in the URL standard's canonical form: a page
  with its trailing slash, a sitemap file without one (`canonicalUrl`, built on
  `src/lib/seo/siteOrigin.ts` and `src/lib/http/urlStandard.ts`). Template URLs use the
  slug rule the pages and the API use (`src/lib/utils/slug.ts`), and category URLs the
  category pages' own function (`src/lib/categorySlug.ts`), so every entry resolves.

## What is listed

- **Public Templates** (`publicTemplateCondition`): public, not archived, with owner fields
  that agree, a Personal row (`owner_type = 'user'`, no `team_id`) or an Organization row
  (`owner_type = 'team'` with a `team_id`); a row whose fields disagree stays out. The
  library, category pages and link previews list an Organization Template under its
  Creator's username (the users join on `templates.user_id`), so the sitemaps do too.
- **Public URLs only.** A profile or Template is listed only when the username is valid (3
  to 30 letters, digits, `_` or `.`), and a Template only when its slug is (lowercase
  letters and digits joined by single hyphens, at most 160): no other one has a public URL.
  The rules run in SQL (`validUsernameCondition`, `validTemplateSlugCondition`), so a
  shard page's `LIMIT` and offset count only rows it lists, and again in code on each row.
  Drizzle has no builders for SQLite's `GLOB` or string functions, so the SQL is written by
  hand, and `tests/unit/functions/sitemap-category-entries.test.ts` keeps it equal to the
  code.
- **Categories.** A category is listed when a public Template with a valid owner username
  uses it, or a bundled starter does. A registry category (`src/data/publicCategories.ts`)
  has a page with its registry name and description, but it is listed only once a public
  Template uses it, since the page is empty otherwise. A category value stored as a plain
  string, from before categories were JSON arrays, counts as one category.

## Last modified dates

- A Template entry is dated by its `updated_at` (else `created_at`) or its owner's
  `sitemap_owner_revisions` row, whichever is newer, and a profile by the user's
  `updated_at` (else `created_at`) or its `sitemap_profile_revisions` row. Bundled
  starters and static pages carry the dates the bundled catalog records from git
  ([RELIABILITY.md](../RELIABILITY.md#deploy-pipeline)).
- `/templates/` takes the newest of its own date, the bundled inventory's date and the
  `templates` revision. `/categories/` lists every category, so it takes the newest of its
  own date, the bundled inventory's date, every category entry and every category
  revision, including the row of a category whose last public Template just left. It
  ignores `sitemap_revisions['categories']`, which the triggers bump on every public
  Template change, with or without a category, and the `'[]'` that uncategorized
  Templates store (and the triggers record) dates nothing. The category list takes nothing
  a caller could pass differently, because the index hashes it to date the categories
  shard and the shard serves the same list.
- The index dates each shard from `sitemap_shard_revisions`: a hash of the shard's rendered
  content and when it last changed. An unchanged hash keeps its date; a changed one takes
  the newer of the family's revision and the shard's newest entry. The index records every page it
  lists there before it responds, and deletes the rows of pages the family no longer fills.
  Each family's revision also follows the catalog's `implementationLastmod`, the newest
  commit to the code that shapes sitemap output (`SITEMAP_IMPLEMENTATION_SOURCES` in
  `scripts/lib/sitemapLastmod.ts`), so a deploy that changes that code advances it.

## Caching

Building a database sitemap scans every public Template or user, so `cachedSitemap()`
(`functions/sitemap/cache.ts`) caches the index and the categories, profiles and templates
shards in the data center ([D1 cost](d1-cost.md#rules-for-d1-queries), rule 5), with
`Cache-Control: public, max-age=300, s-maxage=86400, stale-while-revalidate=3600`. The key
is the sitemap and its parsed page number, never the request path, plus a hash of the
bundled catalog and of the `sitemap_revisions` kinds the sitemap depends on. A kind with no
row yet keys as `null`, so the key stays stable until the row appears. The build receives
only those kinds, so it cannot read one its key ignores, and a `HEAD` request still builds
the `GET` body, so it never caches an empty sitemap.

Crawlers learn shard numbers only from the index, so a page above 1 that the index never
published (no `sitemap_shard_revisions` row) is refused with a `404` after a one-row
primary-key read, instead of missing the cache and scanning every public row. The refusal
is `no-store`, so a page the index adds later is served at once. OpenNext sends every `404`
as `private, no-cache, no-store` and more, so the smoke test checks for `no-store` and for
no directive that would let a cache keep it, not for the whole header. Page 1 is always
built: it holds the landing entry, and a new database has no shard rows until the index is
first built.

Each shard depends only on its own kind, so a sign-up or an avatar change (which bump only
`profiles`) leaves the templates and categories shards cached; the index lists every family
and records their hashes, so it depends on all three. The triggers from migration 0023 must
bump a kind whenever that family's inputs change, or the shard stays stale for up to the
1-day `s-maxage`; `tests/unit/functions/sitemap-migrations.test.ts` pins which kinds each
trigger bumps.

| Kind | Inputs, and the triggers that bump it |
| --- | --- |
| `templates` | Public Template rows (every Template trigger bumps every kind), their owners' usernames and `sitemap_owner_revisions` (the owner-update and user-delete triggers bump it when the user has public Templates and a valid username) |
| `categories` | Public categorized Template rows, their owners' `sitemap_owner_revisions`, and `sitemap_category_revisions` (the Template, owner-update and user-delete triggers bump it whenever they change these) |
| `profiles` | Users with a valid username and `sitemap_profile_revisions` (the user and Template triggers bump it). The triggers ignore `users.updated_at`, so a lastmod that depends on it can lag by up to the `s-maxage` |

The 0023 triggers fire only for Personal Template rows, so an edit to a public Organization
Template reaches a cached shard only when it expires; the
[Organization Template sitemap plan](../exec-plans/active/sitemap-organization-templates.md)
proposes the migration that fixes it.

## Lookups for page metadata

The public pages render their `<head>` on the server
([FRONTEND.md](../FRONTEND.md#production-and-other-environments)), so these lookups
(`src/server/pageMeta/`, called from each route's `generateMetadata`) run on every visit, by
people and crawlers alike. A template or profile lookup answers one of three ways: found;
not found, a settled answer, so the page gets `noindex, nofollow` and no canonical URL (the
address is not a page); or unavailable, when the lookup failed, which may be brief, so the
page keeps the site's defaults and stays indexable
([FRONTEND.md](../FRONTEND.md#missing-pages)).

The data-center cache keys start with the request's origin (`getRequestOrigin` in
`src/server/cloudflare.ts`): staging and production share the `serplists.com` zone and its
cache, so neither reads the other's entries. Reading the request's headers also makes the
page render on each request.

- **Template page** (`/profile/<user>/<identifier>/`, `loadTemplatePageSeo` in
  `src/server/pageMeta/templatePage.ts`): a bundled library template first, since the API
  cannot serve one and it wins on a slug clash; otherwise a public template whose owner has
  this username in any letter case. The canonical URL uses the stored username and the slug
  (the id when there is none), as the sitemap does. The D1 read (`loadPublicTemplate` in
  `functions/seo/public-template-lookup.ts`) is one indexed row (`idx_templates_slug_unique`,
  or the primary key for an id), under the visibility rule `GET /api/templates/slug/:slug`
  applies for a visitor: public and not archived. Like the page, it reads a UUID as a
  template id first and then as a slug, since a slug saved before the API refused UUID
  slugs can look like an id (a UUID no id matches reads one more row); anything else is a
  slug. The `is_public` term is written `+is_public = 1`, which keeps the planner on the
  slug or id index instead of `idx_templates_public_created_at`, and categories are read
  the way the API lists them. A found template is cached in the data center for 5 minutes,
  per host (the key starts with the request's origin), under a key prefix that names the
  record's shape (`/__page-meta/v2/templates/`), so a deploy that changes the shape never
  reads the previous one. A template made private can keep its tags for those 5 minutes;
  the page itself loads it from the API and shows it as not found.
- **Profile page** (`/profile/<user>/`, `loadProfilePageSeo` in
  `src/server/pageMeta/profilePage.ts`): the name and summary the page shows, from the same
  two requests the page makes (`loadUserProfile`), sent to the API router in the same Worker
  (`fetchApiJson` in `src/server/api.ts`) as a visitor with no session: the same handlers,
  visibility rules and edge caches, without a network hop. A found profile's tags are cached
  for 5 minutes, so a busy profile reads D1 once per 5 minutes per data center, and a new
  name or public template can take that long to reach them; the page itself always loads
  the profile from the API. The canonical URL uses the stored username, the one the page
  moves other letter cases to.
- **Category page** (`/categories/<slug>/`, `loadCategoryPageSeo` in
  `src/server/pageMeta/categoryPage.ts`): the category pages count the public catalog in
  the browser, so the server counts the same list with the library's own functions: the
  bundled library merged with the catalog (`GET /api/templates?scope=public`, which the API
  serves from the edge cache), the public templates with a public URL, and the predefined
  categories plus every template category. A row the library cannot read is skipped, as in
  the library. The small summary is cached for 5 minutes, so the catalog is parsed once per
  5 minutes per data center for every category page. A category the server cannot name
  (one only database templates use while the catalog cannot be read, or one that does not
  exist) keeps the site's defaults, and the page decides in the browser; a registry
  category no public template uses yet is `noindex, follow`.
- **Share page** (`loadSharedRunPageSeo` in `src/server/pageMeta/sharedRunPage.ts`, reading
  `loadSharedRunTitle` in `functions/seo/shared-run-lookup.ts`): the run's
  title, under the rule of `GET /api/checklists/shared/:token` (an active share, where
  holding the link is the only credential), in one read on
  `idx_checklist_runs_share_token`, and always `noindex, nofollow`. It is never cached, so a
  revoked link stops naming the run at once. A link that is not an active share, or a
  failed lookup, keeps the site's defaults, still noindex through the `X-Robots-Tag` that
  `next.config.ts` sends for share pages.
