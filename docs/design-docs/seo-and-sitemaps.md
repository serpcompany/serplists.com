# SEO and Sitemaps

How search engines and link previews find the public pages: the XML sitemaps
(`functions/sitemap/`) and the lookups behind the public pages' server-rendered metadata
(`src/server/pageMeta/` and `functions/seo/`). The route handlers in `src/app/sitemap.xml`
and `src/app/sitemaps` only hand these modules the request, the Worker's bindings and
`waitUntil` (`getSitemapContext` in `src/server/sitemapContext.ts`); they export only `GET`,
which Next.js also runs for `HEAD`, without the body. Page titles,
robots rules and environments are in [FRONTEND.md](../FRONTEND.md#page-titles-and-meta-tags),
and what the sitemaps cost in D1 is in [D1 cost](d1-cost.md#rules-for-d1-queries).

## Sitemap URLs

| URL | Lists |
| --- | --- |
| `/sitemap.xml` | Every shard below, each with its last change |
| `/sitemaps/pages/<n>.xml` | The static pages (the Profiles directory, `/profiles/`, among them), from the bundled catalog |
| `/sitemaps/categories/<n>.xml` | `/categories/` and every category in use |
| `/sitemaps/profiles/<n>.xml` | Every User profile with a valid username, then every active Organization's profile with a valid handle |
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

- **Public Templates** (`publicTemplateCondition`, `listedTemplateOwnerCondition`): public,
  not archived, with owner fields that agree, a Personal row (`owner_type = 'user'`, no
  `team_id`) or an Organization row (`owner_type = 'team'` with a `team_id`); a row whose
  fields disagree stays out. Each is listed at its Template Owner's URL, as the library and
  category pages list it: a Personal Template under its User's username (the users join on
  `templates.user_id` for Personal rows only), an Organization Template under its
  Organization's handle while the Organization is active (the teams join on
  `templates.team_id` for Organization rows only, `templateOwnerHandle`), never under its
  Creator's username.
- **Profile Owners** (`functions/sitemap/listedOwners.ts`): a User whose username passes the
  handle rule (`validUsernameCondition`), and an Organization that is not archived and whose
  handle (its slug) passes it (`listedOrganizationCondition`). The profiles shard lists the
  Users in `users.id` order, as before, then the Organizations in `teams.id` order (one
  `UNION ALL`), so adding Organizations moved no User entry. The Template rule above and the
  [Profiles directory](#profiles-directory) use the same two conditions, so an owner the
  directory lists is exactly an owner the sitemap lists
  (`tests/unit/functions/sitemap-organization-profiles.test.ts`). A handle is unique across
  both (the [public handle registry](database-operations.md#public-handle-registry)), so no URL
  is listed twice, and an Organization drops out once it is archived or its handle is cleared
  or stops passing the rule.
- **Public URLs only.** A profile or Template is listed only when the handle is valid (the
  [public handle rule](database-operations.md#public-handle-registry): 3 to 30 letters, digits,
  `_`, `.` or `-`; the user triggers match it since `0029`), and a Template only when its slug is (lowercase
  letters and digits joined by single hyphens, at most 160): no other one has a public URL.
  The rules run in SQL (`validUsernameCondition`, `validOrganizationHandleCondition`,
  `validTemplateSlugCondition`), so a shard page's `LIMIT` and offset count only rows it
  lists, and again in code on each row.
  Drizzle has no builders for SQLite's `GLOB` or string functions, so the SQL is written by
  hand, and `tests/unit/functions/sitemap-category-entries.test.ts` keeps it equal to the
  code.
- **Categories.** A category is listed when a public Template with a valid owner handle
  uses it, or a bundled starter does. A registry category (`src/data/publicCategories.ts`)
  has a page with its registry name and description, but it is listed only once a public
  Template uses it, since the page is empty otherwise. A category value stored as a plain
  string, from before categories were JSON arrays, counts as one category.

## Last modified dates

- A Template entry is dated by its `updated_at` (else `created_at`) or its owner's
  `sitemap_owner_revisions` row, whichever is newer, and a User's profile by the user's
  `updated_at` (else `created_at`) or its `sitemap_profile_revisions` row. An Organization's
  profile is dated by its `updated_at` (else `created_at`), which every change on its settings
  page (name, slug, avatar, description) sets; a change to its public Templates dates their
  own entries, not the profile's. Bundled
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
  `tests/unit/scripts/sitemap-implementation-sources.test.ts` asks dependency-cruiser for
  the modules the sitemap routes reach and fails when one is missing from the list, except
  what is left out on purpose: `db/` and `functions/api/` (the schema, the database client
  and the API types decide how rows are read, not which URLs a sitemap lists, and counting
  them would rebuild every sitemap after each schema change), `src/data/publicCategories.ts`
  (the categories inventory already dates it, and listing it would move every family's date
  on each registry edit) and the redirect at `/sitemaps/static.xml`, which lists nothing.

## Caching

Sitemaps are built per request, never at build time. `getSitemapContext()`
(`src/server/sitemapContext.ts`) calls Next.js's `connection()` before it reads D1.
- Otherwise the build would try to prerender `/sitemap.xml`, the one sitemap route with no
  dynamic segment.
- That would bake in whatever the build machine's database held, or fail the build where that
  database is empty, as it is in CI.

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
and records their hashes, so it depends on all three. The triggers from migrations 0023,
0029 and 0032 must bump a kind whenever that family's inputs change, or the shard stays stale
for up to the 1-day `s-maxage`; `tests/unit/functions/sitemap-migrations.test.ts` and
`tests/unit/functions/sitemap-organization-revisions.test.ts` pin which kinds each trigger
bumps.

| Kind | Inputs, and the triggers that bump it |
| --- | --- |
| `templates` | Public Template rows, Personal and Organization (every Template trigger bumps it), their Users' usernames and `sitemap_owner_revisions` (the owner-update and user-delete triggers bump it when the user has public Templates and a valid username), and their Organizations' handles and archive (the `teams` update trigger bumps it when an Organization with public Templates changes its slug or archive) |
| `categories` | Public categorized Template rows, their owners' `sitemap_owner_revisions`, their Organizations' handles and archive, and `sitemap_category_revisions` (the Template, owner-update, user-delete and `teams` update triggers bump it whenever they change these, and date the categories they touch) |
| `profiles` | Users with a valid username and `sitemap_profile_revisions` (the user triggers and the Personal Template triggers bump it), and active Organizations with a valid handle and their `created_at` and `updated_at` (the `teams` triggers bump it when a listed Organization is created, deleted or archived, or changes its slug or dates). An Organization Template's change never bumps it. The user triggers ignore `users.updated_at`, so a lastmod that depends on it can lag by up to the `s-maxage` |

Migration 0032 made the Template triggers fire for Organization rows too (owner fields that
agree, as above) and added the `teams` triggers, closing TD-23: an edit, publish, unpublish or
delete of a public Organization Template, and an Organization's new slug or archive, miss the
cached shards at once. Their lookups read one Organization's Templates through
`idx_templates_team_id` (`+owner_type` and `+is_public` keep the planner off
`idx_templates_public_created_at`, which would read every public Template). 0032 also dated
the categories only public Organization Templates used, keeping the later date where a
Personal Template had dated one, and bumped every kind once.

## Profiles directory

`/profiles/` (`src/views/ProfilesDirectory.tsx`) lists the Profile Owners the profiles sitemap
lists, in two tabs: People and Organizations. It is a static page whose canonical URL is
`/profiles/` whatever its query (`?collection=organizations`, `?after=` or `?before=` a
handle), since the profiles themselves are in the profiles sitemap; the pages sitemap lists
`/profiles/`. The tabs read the address with `useSearchParams`, so the route wraps the view in
`<Suspense>` with a fallback that renders the same title and description.

`GET /api/profiles` (`functions/api/handlers/profile-directory.ts`, queries in
`functions/api/utils/profile-directory.ts`) answers one page:

- **Inputs**, parsed with `src/lib/schemas/profileDirectory.ts`: `collection` (`people`, the
  default, or `organizations`), and at most one of `after` and `before`, a handle of at most
  64 characters. Anything else is a `400`; unknown parameters are ignored.
- **Pages**: 24 owners (`PROFILE_DIRECTORY_PAGE_SIZE`) in stored handle order, read with a
  cursor on the handle index, never `OFFSET` ([D1 cost](d1-cost.md#rules-for-d1-queries),
  rule 1): People on `idx_users_username`, Organizations on `idx_teams_slug_unique`, with the
  eligibility conditions from `functions/sitemap/listedOwners.ts` in the same `WHERE`. A page
  reads 25 rows to know whether another follows; `before` reads the index backwards and the
  page is reversed. `next_cursor` and `previous_cursor` are the last and first handles shown,
  or `null` at either end.
- **Counts**: one grouped query per page counts the public, non-deleted Templates of the
  page's owners through `idx_templates_owner` or `idx_templates_team_id`, with the condition
  the Public Profile lists them by (`publicTemplatesOfProfileOwners` in
  `functions/api/utils/public-profile-owner.ts`), never a query per card. It reads every
  Template of those owners, as their profiles do.
- **Answer**: each owner's `handle`, `name`, `avatar_url` and `public_template_count`, and
  nothing else: no id, email, membership, role, billing or private Template.
- **Cache**: the answer is the same for every visitor, so `withEdgeCache` keeps it for
  5 minutes under a key built from the parsed inputs
  (`/api/profiles?...&fields=handle-name-avatar-public-template-count`). A new profile can
  take that long to appear, and the page keeps a page it loaded for 5 minutes too.

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

- **Template page** (`/profile/<handle>/<identifier>/`, `loadTemplatePageSeo` in
  `src/server/pageMeta/templatePage.ts`): a bundled library template first, since the API
  cannot serve one and it wins on a slug clash; otherwise a public template whose Template
  Owner has this handle in any letter case: a Personal Template's User, or an Organization
  Template's Organization while it is active (`templateOwnerOf` in
  `functions/api/utils/template-rows.ts`), never its Creator. The canonical URL uses the
  owner's stored handle and the slug (the id when there is none). The D1 read
  (`loadPublicTemplate` in `functions/seo/public-template-lookup.ts`) is one indexed row
  (`idx_templates_slug_unique`, or the primary key for an id) with its Creator and, for an
  Organization Template, its Organization by primary key, under the visibility rule `GET /api/templates/slug/:slug`
  applies for a visitor: public and not archived. Like the page, it reads a UUID as a
  template id first and then as a slug, since a slug saved before the API refused UUID
  slugs can look like an id (a UUID no id matches reads one more row); anything else is a
  slug. The `is_public` term is written `+is_public = 1`, which keeps the planner on the
  slug or id index instead of `idx_templates_public_created_at`, and categories are read
  the way the API lists them. A found template is cached in the data center for 5 minutes,
  per host (the key starts with the request's origin), under a key prefix that names the
  record's shape (`/__page-meta/v4/templates/`), so a deploy that changes the shape never
  reads the previous one. A template made private can keep its tags for those 5 minutes;
  the page itself loads it from the API and shows it as not found.
- **Moved Template page.** The URL a public Organization Template had before #232, its
  Creator's (`/profile/<creator username>/<identifier>/`), answers `moved` from the same
  lookup (the record names the Creator's username for this): the route's page awaits it before
  it renders anything and answers a permanent redirect (`308`, `permanentRedirect`) to the
  Organization's URL, keeping the query string, and `generateMetadata` redirects the same way.
  The page awaits the lookup, so its HTML starts only once the lookup (edge-cached for a found
  template) answers; a redirect thrown later, in a streamed part, would only be a client-side
  refresh. Another User's handle, or an archived Organization's Template, is not found.
- **Profile page** (`/profile/<handle>/`, `loadProfilePageSeo` in
  `src/server/pageMeta/profilePage.ts`): the name and summary the page shows, a User's or an
  active Organization's, from the same two requests the page makes (`loadPublicProfile`:
  `GET /api/profiles/by-handle`, then the owner's public Templates), sent to the API router
  in the same Worker (`fetchApiJson` in `src/server/api.ts`) as a visitor with no session:
  the same handlers, visibility rules and edge caches, without a network hop. A found
  profile's tags are cached for 5 minutes under `/__page-meta/v2/profiles/`, so a busy
  profile reads D1 once per 5 minutes per data center, and a new name, description or
  public template can take that long to reach them; the page itself always loads the
  profile from the API. The canonical URL uses the stored handle, the one the page moves
  other letter cases to. An archived Organization's handle is not found.
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
