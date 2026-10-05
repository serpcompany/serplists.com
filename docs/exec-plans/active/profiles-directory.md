# Profiles directory

- **Status:** active
- **Last updated:** 2026-10-05
- **Goal:** A public, indexable `/profiles/` directory lists every Profile Owner with a Public
  Profile, People and Organizations, a bounded page at a time, and the profiles sitemap lists
  the same Organizations and refreshes when they change (issue #237).

## Progress

Built on `fl/profiles-directory`, to ship in one PR with #207 (the context switcher's "View
Organization profile" link).

- [x] Migration `0032`: the sitemap triggers fire for public Organization Templates and on
  `teams`, so cached sitemaps refresh when an Organization's Templates, slug or archive
  change (TD-23, the [sitemap plan](../completed/sitemap-organization-templates.md)). Applied
  to local D1 only.
- [x] The profiles sitemap lists every active Organization with a valid handle after the
  Users, and the pages sitemap lists `/profiles/`
  ([SEO and sitemaps](../../design-docs/seo-and-sitemaps.md#profiles-directory)).
- [x] `GET /api/profiles?collection=people|organizations&after=|before=`: keyset pages of 24
  on the handle indexes, one grouped public Template count per page, edge-cached for
  5 minutes.
- [x] `/profiles/`: People and Organizations tabs, cards linking to `/profile/:handle/`, and
  the footer's "Profiles" link ([features](../../product-specs/features.md#auth-and-account)).
- [ ] The lead's serial checks: `pnpm run verify`, `test:local-d1` (the rows-read budgets of
  the directory and the profiles shard, set from estimates: replace them with the measured
  rows), `d1:profile`, `test:smoke` and `test:e2e:full` (`tests/e2e/profiles-directory.spec.ts`
  and the additions to the heading, site standards and sitemap specs), `ui:snap` of
  `/profiles/` on desktop and phone as the PR's evidence, and `sitemap:generate` once the
  merge commit dates the sources.
- [ ] Apply `0032` to staging after the PR merges (`pnpm run verify:staging`,
  `pnpm run db:migrate:d1:staging`, `pnpm run check:staging:d1-schema`, which then requires
  the three `teams` triggers and the new `templates` trigger text). Production waits for the
  owner's go-ahead, after `0028` to `0031`.

## Decision log

- 2026-10-04 (owner, on #237): the collections are "People" and "Organizations", never
  "Teams"; the footer link is "Profiles"; the sitemap trigger migration is approved.
- 2026-10-05: eligibility is one rule, shared by the directory, the profiles sitemap and the
  Template rule (`functions/sitemap/listedOwners.ts`): People are Users whose username passes
  the public handle rule; Organizations are active (`archived_at IS NULL`) with a handle that
  passes it, the Organizations `/profile/:handle` resolves. It lives with the sitemap code so a
  change to it moves the sitemaps' implementation date (`SITEMAP_IMPLEMENTATION_SOURCES`
  leaves `functions/api/` out).
- 2026-10-05: pages use a cursor on the stored handle (`after` and `before`), not a page
  number with `OFFSET`, which reads every row it skips ([D1 cost](../../design-docs/d1-cost.md#rules-for-d1-queries),
  rule 1). The order is the handle index's (binary, so `Acme-Launch` comes before `alpha`),
  and no total is counted, since a `COUNT(*)` reads every eligible row.
- 2026-10-05: one page shows one collection, in tabs, rather than both in sections: on a phone
  two lists with their own pagers would be one long page. The tab and cursor are in the
  address (`replaceCurrentUrl` for a tab, a link for Previous and Next), and every address
  names `/profiles/` as its canonical URL, since the profiles are in the profiles sitemap.
- 2026-10-05: the public Template count uses the condition the Public Profile lists them by
  (`publicTemplatesOfProfileOwners`), so a card's count matches the profile's "Templates" stat
  for every owner but `serp`, whose profile also merges the bundled library Templates.
- 2026-10-05: an Organization's sitemap entry is dated by its `updated_at`, else
  `created_at`, with no per-Organization revision table (that would be a new table in the
  approved trigger migration). A change to its public Templates dates their own entries and
  bumps the templates and categories kinds, never `profiles`.
- 2026-10-05: the profiles shard lists Organizations after every User, so the User entries
  kept their order and dates. It reads them in two primary-key-ordered queries rather than one
  `UNION ALL` ordered by owner kind, whose temporary B-tree sort pushed the profiles shard and
  the sitemap index over their rows-read budgets.
- 2026-10-05: the API answers 400 for an unknown collection, both cursors at once, or a cursor
  over 64 characters, and ignores other parameters; the page reads an address it cannot parse
  as the first page of People.
