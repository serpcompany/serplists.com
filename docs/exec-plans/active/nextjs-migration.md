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

- **Pages Router conflict:** the old src/pages folder moves to `src/views/`, so Next.js does not treat it
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
  without running the Worker; each build writes it for its environment
  (`scripts/generate-static-headers.ts`).
- **URLs** follow the SERP URL standard: pages end in `/`, files and the API never do, and
  the other form answers one 308 ([FRONTEND.md](../../FRONTEND.md#urls)).
- **Environments** follow the SERP environment configuration standard: `SITE_ENV` marks
  production in each environment's Worker vars and build, and each environment answers on one
  host ([RELIABILITY.md](../../RELIABILITY.md#environments-and-hosts)).
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

None. Both earlier questions were answered on 2026-09-29 (decision log): the app follows the
SERP URL standard (trailing slashes) and the SERP environment configuration standard, and it
runs on Workers Paid.

## Left for launch

Each of these needs the user's approval, or happens with the domain move:

- **Deploy workflow** (phase 4): build each environment with its own `SITE_ENV`
  (`SITE_ENV=staging` for `--env preview`, `SITE_ENV=production` for `--env production`), then
  run `node scripts/check-site-standards.mjs <workers.dev URL> <staging|production>` against
  the deployment (it sends the smoke-test header), and against the canonical host after the
  domain move.
- **Domains:** custom-domain `routes` for `serplists.com`, `staging.serplists.com` and
  `www.serplists.com` (www reaches the Worker, and so its redirect, only through a route),
  the move from the Pages project, and `wrangler.jsonc` with the `preview` environment renamed
  `staging`. The Pages hosts (`serp-checklists.pages.dev`, `staging.serp-checklists.pages.dev`)
  retire with the Pages project; the `preview` environment's `CORS_ALLOWED_ORIGINS` still
  lists the staging one.
- **Stripe:** the live Customer Portal configuration's `default_return_url` still names
  `/account` (`stripe:portal:configure` only creates a configuration when there is none). The
  app passes its own return URLs, and `/account` redirects in one hop, but the live setting
  should become `https://serplists.com/dashboard/settings/`.
- **Cloudflare Web Analytics** is injected by the zone, not by the app: keep it off for
  `staging.serplists.com`, which loads no analytics of its own.
- **Search engines:** after the move, every old URL without its slash answers 308 once;
  resubmit `https://serplists.com/sitemap.xml` in Search Console.

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
  - [x] Unit tests on Next.js navigation (`tests/support/nextNavigation.tsx`), route files
    and metadata (`c3a83595`); the leave guard redesigned with them (`96cc0f1a`,
    `b6c08987`).
  - [x] ESLint with `eslint-config-next` (core web vitals and the React Compiler rules),
    fixed without suppressions (`ed4aba10`, `5233f50b`).
  - [x] Development scripts: `dev:all` runs one `next dev` on a free port; `setup`,
    `ui:snap`, `d1:profile`, the Stripe listener, `.dev.vars.example` and
    `cloudflare-env.d.ts` follow (`07054f13`).
  - [x] Browser suite on the OpenNext build in workerd (`opennextjs-cloudflare preview`):
    all 246 tests pass on one worker in 39 minutes (`89d31049`). CI builds with OpenNext
    and tests that build; the Pages deploy is disconnected (`3f667692`). Worker now:
    14,177 KiB, 2,883 KiB gzipped (`wrangler deploy --dry-run`), 189 KiB under the Workers
    Free limit.
  - [x] Workers Paid, confirmed by the user: 10 MiB per Worker and no 10 ms CPU cap.
  - [x] SERP environment configuration standard: `SITE_ENV` in each environment's vars in
    `wrangler.toml` and in its build. Anything but production sends `X-Robots-Tag: noindex`,
    disallows crawlers in robots.txt and loads no Tag Manager; `public/_headers` is generated
    per build (`b8b0baa8`).
  - [x] SERP URL standard: pages end in `/`, files never do, the other form answers one 308,
    and the API and `/.well-known` are never redirected. Links, navigation, canonical and
    Open Graph URLs, JSON-LD, sitemaps and the URLs the API writes are canonical, and legacy
    paths redirect in one hop (`8f8fe8d0`, `4808b7a4`).
  - [x] One host per environment: `www.serplists.com` and every `*.workers.dev` URL answer
    308 with the environment's host, and the `x-serplists-smoke-test` header exempts
    workers.dev (`1e0d7588`).
  - [x] Browser tests on canonical URLs, with `tests/e2e/site-standards.spec.ts`, and
    `scripts/check-site-standards.mjs` for a running site (`89a433b5`, `a6a95c6a`). Production
    and staging builds, served in workerd with `opennextjs-cloudflare preview --env production`
    and `--env preview`, pass all 45 of its checks. The full browser suite passes on the
    production build: 253 tests on one worker in 29 minutes.

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
- 2026-09-29: **Leave guard on Next.js navigation.** The page decides a navigation after
  it renders its latest state (`leavePage` in `leaveGuard.ts`), so a page that saved and left
  in the same step goes without a question. It holds one marked copy of its history entry
  for its life: Back past it asks once, a navigation away replaces it, and a #fragment above
  it is not a way out.
- 2026-09-29: **Legacy category sitemap** is a route handler, not a `next.config.ts`
  redirect, which dropped `?page=`: it redirects to the page's shard like
  `/sitemaps/static.xml`.
- 2026-09-29: **Lint.** ESLint stays (the file-size caps and the suppressions file), with
  `eslint-config-next/core-web-vitals`. Its React Compiler rules were fixed, not suppressed:
  state read from outside React goes through `useSyncExternalStore` with a server snapshot,
  state reset by a changed input is adjusted while rendering, and refs are written in
  effects. `next/link` and `useRouter` are restricted to the app's navigation code, and user
  content keeps plain `<img>` elements.
- 2026-09-29: **Head scripts.** In the App Router, `next/script`'s `beforeInteractive` only
  queues an inline script for Next.js's runtime, after the first paint, so a dark-theme page
  flashed light. The theme script and the Tag Manager bootstrap are plain scripts in the
  root layout's `<head>`, as in `index.html` before.
- 2026-09-29: **Local servers** (`localhost`, `127.0.0.1`) get the Content-Security-Policy
  without `upgrade-insecure-requests`: over http, Chrome upgraded the redirects client
  navigations follow (`/dashboard`) to https and the navigation stalled for about 15
  seconds. Every host but `serplists.com` gets `X-Robots-Tag: noindex, nofollow`, as the old
  app's host check did for every host (the page metadata cannot know the host). Replaced by
  `SITE_ENV` below.
- 2026-09-29: **`dev:all`** runs one `next dev` on a free port from 3000. `next dev` reads
  bindings only from `wrangler.toml` and `.dev.vars` (OpenNext passes no env files), so the
  launcher hands the port-dependent vars (`FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, the auth
  secret) to `next.config.ts` in `SERPLISTS_DEV_BINDINGS`, which sets them over the
  bindings.
- 2026-09-29: **Browser tests run the production build** in workerd: the runner builds with
  OpenNext, seeds `.wrangler/smoke-state`, and `tests/e2e/preview-server.mjs` serves it with
  `opennextjs-cloudflare preview` and `--var` overrides (passed through a shell, so only
  plain values). They run on one Playwright worker (one workerd process renders every page
  and prefetch), sign in by typing (no dev Fill buttons in production), and move inside the
  app with Next.js's router (`window.next.router`), since a synthetic `pushState` only
  changes the URL. Specs whose expectations were Vite-era implementation details were
  updated: no `/link-preview/` route (every page's own tags are in its HTML), return paths
  in `?next=`, `/dashboard` redirected by the server, OpenNext's own `Cache-Control` on
  404s, and robots tags a page may repeat in the browser.
- 2026-09-29: **Not-found metadata** for a missing template or profile names no canonical URL
  (the address is not a page), as those pages had none before.
- 2026-09-29: **Deploys.** `cloudflare-pages-deploy.yml` has no caller and fails at its first
  step, since `pnpm run build` makes no `./dist` for Pages; the Workers deploy replaces it in
  phase 4.
- 2026-09-29: **Windows builds:** `opennextjs-cloudflare build` bundles the repo's real,
  unpatched Next.js on Windows, because pnpm's links there are absolute (the build fails on
  `sharp`). OpenNext supports Linux and WSL; CI builds on Linux. `.npmrc` sets
  `node-linker=hoisted`, so the Windows build works too (`02b0a62d`).
- 2026-09-29: **Prefetching and caching.**
  - The app's `Link` prefetches on intent only: pointer, focus or touch, following Next.js's
    hover-triggered prefetch pattern (`c8ae52cb`). Before that, a page view cost about ten
    prefetch requests to the Worker.
  - `open-next.config.ts` uses OpenNext's read-only static assets cache with cache
    interception, so prerendered pages are answered without loading the Next.js server
    (`c81a500f`; the preview sends `x-opennext-cache: HIT`). The app never revalidates on a
    timer, which that cache cannot do.
  - A page view now costs one Worker request (the HTML, or the RSC payload of a client-side
    navigation) plus the API calls the page makes, as before.
- 2026-09-29: **SERP standards.** The user chose SERP's standards for every URL and
  environment: the URL trailing-slash standard and the environment configuration standard
  (as in zenbujapanese.com's `next.config.ts`), and Workers Paid.
- 2026-09-29: **Trailing slashes through `redirects()`.** `trailingSlash: true` gives the URLs
  Next.js writes their slash; `skipTrailingSlashRedirect: true` turns off Next.js's own
  redirect, and rules built by `src/lib/http/urlStandard.ts` do that work.
  - Next.js's redirect would move `/api/*` under `next dev`, and OpenNext skips it for
    `/api/` and for files, so the two runtimes would disagree.
  - A `proxy.ts` was rejected: Next.js 16 runs the proxy only on Node.js, which OpenNext's
    Cloudflare adapter (1.20) calls experimental, and it would run for every request.
  - Next.js matches a rule's source with or without a trailing slash, so a page rule ends
    with `(?!/)` or it would redirect the slashed URL to itself.
  - `tests/unit/config/urlStandard.test.ts` runs every rule through Next.js's server and
    OpenNext's routing, which must agree.
- 2026-09-29: **The API and `/.well-known` keep their exact paths**, with or without a slash,
  and on other hosts too: Better Auth, the Stripe webhook, uploads and MCP clients call exact
  paths and do not all follow redirects.
- 2026-09-29: **Profile pages are always pages.** Usernames may contain dots (Better Auth's
  username validator), so `/profile/john.doe/` is a page, not a file.
- 2026-09-29: **Legacy paths** (`/account`, `/console/*`, `/checklists`, `/dashboard/profile`)
  redirect straight to the canonical URL, in one hop. `/dashboard/` is not a page: it answers
  307 with the dashboard's home, and links go to the home itself (`buildConsoleHomePath`).
- 2026-09-29: **`SITE_ENV` instead of the host.** Only `SITE_ENV=production` is production;
  anything else, or nothing, is not. It is set in each environment's Worker vars and in its
  build, because the build bakes it into the static pages (robots.txt among them), the
  `next.config.ts` headers and redirects, and `public/_headers`. Staging answers robots.txt
  with `Disallow: /` as well as sending noindex, as the standard asks; this replaces the
  earlier rule that kept robots.txt crawlable on other hosts, which no longer serve the site.
  The Tag Manager bootstrap renders on production only.
- 2026-09-29: **The browser tests run the production configuration** (`SITE_ENV=production`
  in the runner and in CI's build), since production is what users see. Staging's rules are
  covered by unit tests and by `scripts/check-site-standards.mjs` on a staging build.
- 2026-09-29: **One host per environment.** `www.serplists.com` redirects to `serplists.com`,
  and every `*.workers.dev` URL (version previews included) to its environment's host, in one
  hop and in canonical form. A request with the `x-serplists-smoke-test` header (not a secret)
  skips the workers.dev redirect, so CI can test a deployment before the domains move. Host
  rules were checked in workerd with `opennextjs-cloudflare preview --env <env>` and a `Host`
  header, which Wrangler keeps as long as the environment has no custom-domain routes.
