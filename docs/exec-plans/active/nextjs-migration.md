# Next.js migration

- **Status:** active
- **Last updated:** 2026-09-29
- **Goal:** Replace the Vite single-page app with a Next.js app on the stack approved for
  zenbujapanese.com (`apps/web` in the zenbujapanese monorepo), with full functionality and
  normal web-app behavior, and restyle the whole app after aiuxplayground.com using default
  shadcn components.

## Target stack

The same as the approved reference:

- **Framework:** Next.js 16 (App Router in `src/app`) and React 19.
- **Hosting:** Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`).
  Cloudflare runs full Next.js (server rendering, route handlers, dynamic routes) only on
  Workers, not on Pages. `pnpm dev` runs `next dev` with bindings from
  `getCloudflareContext()`; `pnpm preview` runs the OpenNext build in workerd.
- **Configuration:** `wrangler.jsonc`. The top level is local development. `env.staging` and
  `env.production` are separate Workers, each with its own D1 and R2 bindings and custom
  domain.
- **Data:** D1 and R2 through `getCloudflareContext()`. The API keeps its code and runs as a
  catch-all route handler, `src/app/api/[[...route]]/route.ts`, on the same origin as the
  pages.
- **UI:** Tailwind CSS v4 and shadcn/ui, style `base-nova` (Base UI primitives), base color
  `neutral`, `lucide` icons, the Geist font. Default component styling, no custom design.
  Layout patterns follow aiuxplayground.com: a centered header with navigation menus, a hero
  with search and chips, section rows over card grids, bordered list cards, and detail pages
  with breadcrumbs.

## Architecture decisions

- **Pages Router conflict:** `src/pages/` moves to `src/views/`, so Next.js does not treat it
  as the Pages Router.
- **Public pages** render on the server, with their metadata from the Metadata API
  (`generateMetadata` for the template, profile, category and shared-run pages). Every page
  then has its own title and link preview, so the link-preview functions, their page shell
  and the bot rewrite rule are gone. Page data still loads in the browser with React Query.
- **App pages** (dashboard, template editor, runs, settings, archive) stay client-rendered
  with React Query, behind an authenticated layout.
- **Sitemaps** become route handlers built on `functions/sitemap/`.
- **Security headers and redirects** move from `public/_headers` and `public/_redirects` into
  `next.config.ts`, because rendered pages come from the Worker, not static assets.
  `public/_headers` keeps the rules for static files, which Workers Static Assets serves
  without running the Worker.
- **Unsaved-changes guard:** React Router's blocker is replaced by a navigation guard that
  covers links, router calls, Back/Forward, and reload or close.

## Constraints from the user

- A normal web app: real routes, no rewrite tricks, no Cloudflare dashboard tweaks.
- **One-time launch step:** `serplists.com` and `staging.serplists.com` move from the Pages
  project to the new Workers. This is done through `routes` in `wrangler.jsonc`, applied by the
  deploy, and needs approval at launch.
- Work stays local until the user approves a push.
- Run at most 2 agents and one browser stack at a time.

## Phases

1. **Foundation:** prove the stack on this app.
   - Dependencies, `next.config.ts`, `open-next.config.ts`, `wrangler.jsonc`, `tsconfig`.
   - The API route handler, and one server-rendered public page that reads D1.
   - One signed-in app page.
   - Check both under `pnpm dev` and `pnpm preview`, and measure the Worker size. The limit
     is 3 MiB compressed on Workers Free and 10 MiB on Paid.
2. **Port with today's look.**
   - Move every route and feature, with the same URLs and behavior.
   - Get unit tests (mocking `next/navigation`) and the browser suite (against
     `pnpm preview`) green.
   - Remove Vite, React Router, react-helmet-async and the link-preview functions.
   - Update the docs and the development scripts.
3. **Restyle.**
   - Move to Tailwind v4 and regenerate shadcn components with `base-nova`/`neutral`.
   - Build shared, reusable layout components.
   - Apply them to public pages after the reference, and use shadcn blocks (sidebar, cards,
     tables) for the signed-in app.
   - Screenshots as evidence; tests green.
4. **Launch prep.**
   - GitHub Actions deploys: staging first, then production, with migrations and a smoke test.
   - A list of secrets per Worker.
   - A domain-move checklist.
   - ARCHITECTURE, FRONTEND, RELIABILITY and AGENTS updates.

## Open questions

- **Trailing slashes.** zenbujapanese.com follows the SERP URL standard: pages end in `/`,
  files never do. Adopting it here means a 308 redirect from every current URL. It is
  cheapest to do during the port.
- **Lint.** The reference uses Biome. This repo keeps ESLint, with `eslint-config-next`
  added, for its guardrails (file-size caps, the suppressions file), unless Biome is required.
- **Local Worker builds on Windows.** `pnpm run preview` fails on Windows (see the decision
  log). Options: build in WSL; set pnpm's `node-linker=hoisted`, which drops the links; or a
  build helper that repoints OpenNext's copied links at its patched copies (a local one
  proved the build).

## Progress

- [x] Branch `fl/nextjs-migration` from `fl/bug-hunt` (`f0a903f8`, full browser suite green:
  246 tests).
- [x] Reviewed the reference stack and the aiuxplayground.com layouts (screenshots taken
  locally).
- [x] Phase 1: foundation (`b862f749`, `7fc1e59d`).
- [ ] Phase 2: port with today's look.
  - [x] Every view on Next.js navigation; React Router, its route table, `LegacyRedirect`
    and `ScrollToTop` removed (`04eecc7d`).
  - [x] Metadata API on every page, server lookups for the dynamic public pages;
    react-helmet-async, `SEOHead` and the link-preview functions removed (`04eecc7d`).
  - [x] Sitemaps as route handlers, with the same URLs and cache (`9ffb77ef`).
  - [x] Vite removed; `build`, `preview` and `typecheck` on Next.js and OpenNext
    (`56f8a9e3`). `next build` and `opennextjs-cloudflare build` succeed; the preview in
    workerd serves the public pages, sign-in, the dashboard, the API and the sitemaps.
    Worker: 13,913 KiB, 2,808 KiB gzipped (Workers Free allows 3 MiB).
  - [ ] Unit tests (mocking `next/navigation`) and the browser suite against the preview.
  - [ ] Development scripts (`dev:all`, `setup`, `run-smoke`, `ui:snap`), `.dev.vars` and
    the development environment docs.

## Decision log

- 2026-09-29: **Next.js on Workers through OpenNext.**
  - Static export on Pages was rejected: dynamic routes would need rewrite workarounds, and
    the user asked for a normal web app with no workarounds.
  - vinext, which Cloudflare now lists first, was rejected: it reimplements Next.js on
    Vite, and its repository says it is not production-ready. OpenNext runs the real
    Next.js build, and the approved reference uses it.
- 2026-09-29: **Port first, then restyle.** Each step is verified on its own, so a broken flow
  points at one change.
- 2026-09-29: **Wrangler 4.143** (required by OpenNext) fixed the proxy's restart check
  and retries dropped GET/HEAD upstream, but not POST or PUT. `patches/wrangler@4.54.0.patch`
  is re-created for 4.143 only if the browser suite still shows dropped writes.
- 2026-09-29: **No router state.** Return paths travel only in `?next=` (sanitized by
  `getReturnPath`). Sign-up hands the new account's email to `/login` in sessionStorage,
  and the login page keeps it in its own history entry, so it never enters a URL and a
  reload of that page still fills the form.
- 2026-09-29: **Query changes that are not navigations** (dropping a reset token or a
  notice, the library's filters) rewrite the entry with the History API
  (`replaceCurrentUrl`): `router.replace` would fetch the page from the server on every
  keystroke. The library keeps its "written here" marker in the entry's state, as before.
- 2026-09-29: **Page visits without location keys.** A link to the page already open changes
  nothing a hook can read in Next.js, so the app's `Link` and `useAppRouter` report every
  navigation (`navigationSignal.ts`), and popstate counts too.
- 2026-09-29: **Metadata lookups.** The template page reads one D1 row (the existing lookup,
  cached 5 minutes). The profile page and the category counts go through the API router
  in the same Worker and the library's own functions, so they say exactly what the page
  shows; their results are cached 5 minutes. A category the server cannot name keeps the
  defaults and the page decides in the browser, adding noindex when it has nothing to show.
- 2026-09-29: **Unknown feature slugs** show the 404 view with `noindex` (as before), not
  `notFound()`: a page that throws `notFound()` renders through Next.js's error recovery
  (an empty HTML body that the browser fills), and with OpenNext's default (dummy)
  incremental cache a `dynamicParams = false` route answers 404 even for its own slugs.
- 2026-09-29: **Template packs:** Turbopack's `import.meta.glob` matched nothing for a
  `../` pattern, so the bundled library was empty in the foundation build; the glob now
  sits in `src/data/public-template-packs/index.ts`.
- 2026-09-29: **Windows builds:** `opennextjs-cloudflare build` bundles the repo's real,
  unpatched Next.js on Windows, because pnpm's links there are absolute (the build fails on
  `sharp`). OpenNext supports Linux and WSL; CI builds on Linux. How to build locally on
  Windows is open (below).
