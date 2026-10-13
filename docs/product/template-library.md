# Template library and categories

The public Template library (`/templates`), the Categories page (`/categories`), and each
category's page (`/categories/{slug}`).

Abbreviations: **Library** is `tests/unit/hooks/useTemplateLibrary.test.tsx`, **Catalog spec** is
`tests/e2e/public-template-catalog.spec.ts`, **Categories page** is
`tests/unit/views/Categories.dom.test.tsx`, **Category slugs** is
`tests/unit/lib/categorySlug.test.ts`, **Sitemap** is `tests/unit/functions/sitemap.test.ts`,
**Category page meta** is `tests/unit/server/pageMeta/categoryPage.test.ts`, **Category page
view** is `tests/unit/views/CategoryDetail.test.tsx`, **Category route** is
`tests/unit/views/CategoryDetailRoute.dom.test.tsx`, **Routes** is
`tests/unit/lib/routes.test.ts`, **Public page view** is
`tests/unit/components/PublicTemplateView.test.tsx`, and **Category counts** is
`tests/unit/components/categoryCounts.test.tsx`.

## The library

A public Template's only URL is under its Template Owner's handle
([one public URL](public-templates.md#one-public-url)), so the library and the category pages list
a public Template only when its Template Owner has a handle, as the sitemaps do.

- Check: Library, "leaves out public templates that have no public URL because their owner has no
  username".

The library keeps its search, sort and category filters in the URL (`?search=`, `?sort=`,
`?category=`), so links and Back and Forward change what it shows.

- Check: Catalog spec, "library filters follow the URL".

A link to `/templates?category={slug}` with no other filter redirects to `/categories/{slug}`; the
library's own filter edits never redirect.

- Check: Catalog spec, "a legacy category-only library link opened from elsewhere goes to the
  category page" and "clearing the search on a legacy category link keeps the user on the library".

## The Categories page

`/categories` searches the category names and descriptions. A search that matches none shows
'No categories match "`<query>`"' with a Clear search button that brings back every category.

- Check: Categories page, "says no category matches and offers Clear search, which lists every
  category again".

While the catalog loads, the page shows skeletons, and a catalog that failed shows one retry
state; it never presents the bundled starter Templates as the whole catalog.

- Check: Categories page, "shows skeletons, not the bundled-only categories and counts, while the
  catalog loads" and "shows one retry state instead of bundled-only categories when the catalog
  failed".

## Category pages

Each category a public Template uses has a page at `/categories/{slug}`. The slug keeps letters
and digits in any script (`日本語`, `русский`), with the marks that are part of a letter there
(Japanese dakuten, Devanagari vowel signs, Cyrillic `й`), drops accents on Latin letters and folds
the others the way Template slugs do (`Café Culture` is `cafe-culture`, `Straße` is `strasse`),
folds full-width letters (`ＳＥＯ` is `seo`), and joins words with hyphens.

- Check: Category slugs, "buildCategorySlug, which keeps the letters of every script so no two
  categories share an empty slug" and "gives distinct scripts distinct slugs".

The page and the category sitemap build the slug with the same function
(`src/lib/categorySlug.ts`).

- Check: Sitemap, "slugs categories exactly like the category pages do, in every script".

The page also opens for other letter cases and Unicode forms of the slug.

- Check: Category page view, "opens the category from a decomposed (NFD) or upper-case URL".

Following a link to another spelling of the open category keeps the page, with its search and
sort.

- Check: Category route, "keeps the page for another spelling of the same category".

Whatever spelling it opens at, the page names the category's own URL as its canonical.

- Check: Category page meta, "points another spelling of the slug at the category’s own URL".

An old ASCII-only slug (`caf-culture`) redirects to the current one.

- Check: Routes, "finds an accented category from the URL it had before its letters were folded".

A category with no letters or digits (only emoji or punctuation) has no page: it is not listed as
a category.

- Check: Category slugs, "gives a category with no letters or digits no page".

On a Template's page such a category shows as plain text, and every other category links to its
page.

- Check: Public page view, "links each category to its page and leaves one with no letters or
  digits unlinked".

Spellings with the same slug (`SEO` and `seo`, `Q&A` and `QA`) are one category: a Template counts
once toward it however often it lists it, so a category's count always equals the Templates its
page lists.

- Check: Category counts, "category counts of templates that list one category twice under one
  slug, as imports and API calls can store" and "match the number of templates the category page
  lists".

Template imports and the editor keep only the first spelling (`uniqueCategoryNames` in
`src/lib/categorySlug.ts`). The API still stores lists written directly to it as sent.

- Check: Category counts, "keeps the first spelling of each slug, trimmed, and names with no slug
  once", "are deduplicated by slug when a backup is imported" and "are deduplicated by slug when
  the editor saves".

A category page's link preview names the category and its public Template count, also for a
category only database Templates use, read from the catalog. A category nothing uses keeps the
site's defaults, and a built-in category no public Template uses yet stays out of search.

- Check: Category page meta, "names a category that only database templates use, from the
  catalog", "keeps the site defaults for a category nothing uses, and lets the page decide" and
  "keeps a built-in category that no public template uses yet out of search".
