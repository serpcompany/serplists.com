# Frontend

A React 18 single-page app in `src/`, built with Vite and TypeScript (`strict`).
Server state goes through TanStack Query, routing through React Router 6, and UI
through shadcn/ui on Tailwind ([DESIGN.md](DESIGN.md)). Path aliases: `@/*` maps to
`src/*`, `@functions/*` to `functions/*`.

## Structure

| Path | Role |
| --- | --- |
| `src/App.tsx`, `src/main.tsx` | Providers, routes, bootstrap |
| `src/pages/` | Route screens: compose components and feature models |
| `src/components/` | Feature UI; `components/ui/` holds presentational primitives |
| `src/features/*/` | Headless feature models (`use*Model.ts`) and mappers from API shapes to domain types |
| `src/contexts/` | Auth, Ownership Context (legacy `WorkspaceContext`), Templates and Runs |
| `src/hooks/` | Shared hooks |
| `src/lib/api.ts` | The only HTTP client (transport) |
| `src/lib/schemas/`, `src/types/` | Zod schemas and domain types, shared with the API |

Enforced by `pnpm run deps:check` ([ARCHITECTURE.md](../ARCHITECTURE.md)): pages and
components never call `src/lib/api.ts` at runtime (put the call in a feature model
or context), `components/ui/` stays presentational, and every module must be
reachable from `src/main.tsx`. Remaining legacy call sites are tracked in the
[UI decoupling plan](exec-plans/active/ui-decoupling.md).

Canonical private routes live under `/dashboard/*`; the full route list is in
[system overview](design-docs/system-overview.md#routes).

## Data and state

- `src/lib/api.ts` handles the base URL, JSON, and structured errors, and sends the
  Better Auth session cookie with `credentials: 'include'`. It never stores tokens.
  Responses are not yet parsed with Zod (TD-2 in the
  [tech debt tracker](exec-plans/tech-debt-tracker.md)).
- Contexts and feature models own server state with React Query. Query keys include
  the user id and the active Ownership Context so Personal and Organization data
  never mix; switching context invalidates Template and Run queries. Billing keys
  include the user id; never show a Free or Pro label while status is loading.
- Template and run lists load on demand. `TemplatesProvider` wraps every route but
  never fetches them. A page that reads `templates` (the public catalog) calls
  `useTemplateLists({ catalog: true, workspace: false })`, one that reads `allTemplates`
  calls `useTemplateLists()`, and one that reads `runs` adds `runs: true`. The run page
  fetches its own run by id. A catalog miss reads every public Template from D1
  ([D1 cost](design-docs/d1-cost.md)), so pages that only need official templates use
  the bundled `repoTemplates`. The catalog's query key has no user id because the
  catalog is the same for everyone.
- `templates` always includes the bundled `repoTemplates`, so a non-empty list does not
  mean the catalog loaded. Discovery pages read `catalogPending` and `catalogError` from
  `useTemplateLists` (`loading`, `catalogError`, and `retryCatalog` in
  `useTemplateLibrary`): show a skeleton while pending, a retry state on error, and a
  404 or "no templates" message only after the catalog loaded. A failed catalog request
  stays an error; it is never cached as an empty catalog.
- Browser storage goes through `src/lib/browserStorage.ts` (`safeLocalStorage`,
  `getLocalStorage()`). When a browser blocks site data, even reading
  `window.localStorage` throws, and one unguarded read in a component mounted on every
  route replaces the whole app with the error screen. The helper never throws and keeps
  values it cannot persist in memory for the session. ESLint rejects direct access
  anywhere else in `src/`.
- Mutations are complete only when the persistence promise resolves. Do not
  navigate or report success from a fire-and-forget mutation, and preserve fields
  you are not editing (for example, `rules`) on update.
- Surface API failures by their structured code, not message text: `401` means sign
  in (keep the return path), `403 upgrade_required` and `403 limit_reached` mean a
  plan gate, `503 billing_unavailable` means checkout is down.

## Template editor forms

- `src/lib/forms/templateEditorDetailsForm.ts` owns the top-level details contract;
  `src/lib/forms/templateEditorForm.ts` owns the combined editor contract, editor
  types with guaranteed ids, and nested field factories.
- Use React Hook Form field arrays for sections, items, content blocks, and
  sub-items instead of a second nested state tree.
- Omit an empty slug from create and update payloads rather than sending `""`.
- Keep category autocomplete triggers as real text inputs and use `onKeyDown` for
  tag entry.
- Preserve `seoTitle`, `seoDescription`, `slug`/`seoUrl`, and `rules` across save
  and reload.
- Adding a content type or editor tab: [template content types](design-docs/template-content-types.md).

## Rendering user content

Render Markdown with `MarkdownBlock` (`src/components/shared/MarkdownBlock.tsx`), the
only module that imports `react-markdown`. It disables raw HTML and passes links through
`safeUrl` (`src/lib/utils/safeUrl.ts`); pass other media URLs through `safeUrl` too.

## Page titles and meta tags

Pages set their title and social tags with `SEOHead`
(`src/components/shared/SEOHead.tsx`), which titles them "Page | SERP Lists" through
`buildPageTitle` in `src/lib/brand.ts`. `App.tsx` wraps everything in
`DocumentHeadProvider`, whose default title is the brand alone, so a page without
`SEOHead` never keeps the previous page's title. Do not add a `titleTemplate`: `SEOHead`
already adds the suffix.

`index.html` keeps a static description, Open Graph and Twitter tags for crawlers that do
not run JavaScript. Each carries `data-rh="true"`, so react-helmet-async owns it: a page's
`SEOHead` replaces it by name or property instead of adding a second copy. The same tags
are the defaults in `DocumentHeadProvider`, which puts them back when a page without
`SEOHead` opens. Keep the two identical, and give any new static SEO tag `data-rh` and a
matching default (`tests/unit/components/documentHeadMeta.test.tsx` checks both). The
viewport and charset tags are global: they stay in `index.html` only, without `data-rh`.

Every page shares one link-preview image, `public/og-default.png` (1200x630), named by
its absolute URL on `https://serplists.com` (`SITE_SOCIAL_IMAGE` in
`src/lib/publicPageMeta.ts`). Social sites ignore SVG images and relative URLs. Link
previews do not run JavaScript either, so for public template, category, `/categories` and
`/templates` pages the Pages Functions in `functions/seo/` serve `index.html` with the page's
title, description, `og:type`, canonical link and `og:url` already filled in (with
`data-rh`, so `SEOHead` takes them over). The pages and those functions read their text
from `src/lib/publicPageMeta.ts`; change it there, not in the page, so the preview and the
page agree. A new public route with its own `SEOHead` text needs a matching function.

Cloudflare Pages serves `index.html` with a 200 for every unknown path, so the 404 page
(`src/pages/NotFound.tsx`) marks itself `noindex` and declares no canonical URL. Render
`NotFound` only once a lookup has settled: a page whose data is still loading, or failed
to load, shows a loading or retry state instead, so a real page never sends `noindex`.
Never render `NotFound` next to an `SEOHead`. Do not add a top-level `404.html`; it turns
off the single-page app fallback.

Pages with their own not-found message (a public template or profile) render
`NotFoundHead` (`src/components/shared/NotFoundHead.tsx`) for the same title and
`noindex` tag. Only an API 404 (`isNotFoundError` in `src/lib/api-errors.ts`) counts as
settled. A network failure, 5xx or rate limit may be transient, so it shows a retry state
without `noindex`; see `loadTemplateDetailData` and `loadPublicProfile`.

## Verifying UI changes

Show the change working in the real app before opening a PR:
`pnpm run ui:snap -- <route> --login admin@test.com` for a screenshot and
accessibility tree, and the browser tests for flows
([development environment](design-docs/development-environment.md)).
