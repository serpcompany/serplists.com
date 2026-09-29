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
- **Public pages** render on the server with `generateMetadata`. That covers landing,
  pricing, features, the library, categories, template and profile pages, and the shared-run
  page. Every page then has its own title and link preview, and `functions/link-preview/`,
  `functions/seo/page-shell.ts` and the bot rewrite rule go away.
- **App pages** (dashboard, template editor, runs, settings, archive) stay client-rendered
  with React Query, behind an authenticated layout.
- **Sitemaps** become route handlers built on `functions/sitemap/`.
- **Security headers and redirects** move from `public/_headers` and `public/_redirects` into
  `next.config.ts`, because rendered pages come from the Worker, not static assets.
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

## Progress

- [x] Branch `fl/nextjs-migration` from `fl/bug-hunt` (`f0a903f8`, full browser suite green:
  246 tests).
- [x] Reviewed the reference stack and the aiuxplayground.com layouts (screenshots taken
  locally).
- [ ] Phase 1: foundation.

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
