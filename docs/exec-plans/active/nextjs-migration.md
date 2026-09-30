# Next.js migration

- **Status:** active
- **Last updated:** 2026-09-30
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
  - Keep the Pages workflow's gate that refuses to deploy while migrations are pending:
    `pnpm run verify:prod:d1` before a production deploy, `pnpm run verify:staging` before a
    staging one, with the Cloudflare secrets (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL`,
    `CLOUDFLARE_API_KEY`) in their environment.
  - Build both environments with `NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED=true`. Staging's #250
    set the Vite name of this flag, `VITE_PERSONAL_RUN_MCP_ENABLED: "true"`, for every build in
    the (now disconnected) Pages workflow. Next.js inlines `NEXT_PUBLIC_*` values when it
    builds, so without it Agent Access stays hidden on the deployed hosts. The server flag
    `PERSONAL_RUN_MCP_ENABLED = "true"` is already set for `preview` and `production` in
    `wrangler.toml`.
- **Production D1 migrations 0026 and 0027** (a human-approved step): production has not
  applied `0026_tune_indexes_for_d1_reads.sql` or `0027_add_personal_run_key_permissions.sql`.
  Apply 0027 before the promotion deploy that ships per-key Run Key permissions (staging #257):
  the deploy's pending-migration gate refuses to deploy until it is applied
  (`check:prod:d1-schema` requires `personal_run_keys.permissions`), and code without the
  column fails the Run Key list and every MCP request with `no such column: permissions`. Back
  up, then `pnpm run verify:prod:d1`, `pnpm run db:migrate:d1:prod` and `pnpm run
  check:prod:d1-schema`, with `CLOUDFLARE_ACCOUNT_ID` set to SERP's account ([database
  operations](../../design-docs/database-operations.md#applying-migrations)). Check staging's
  database the same way (`pnpm run verify:staging`) before the first Workers deploy there.
- **The `MCP rate limit` WAF rule** (zone `serplists.com`, [SECURITY.md](../../SECURITY.md#rate-limits))
  matches requests by host and path, so it should keep applying once `serplists.com` points at
  the Worker; confirm it after the domain move.
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
- [ ] Phase 3: restyle, in two steps. Step 1 builds the foundation, the shared blocks, both
  shells, Home, the template library and the public template page; step 2 moves the other
  screens onto the same blocks.
  - [x] Tailwind CSS 4 through the official upgrade tool, with `@tailwindcss/postcss`,
    `tw-animate-css` and `shadcn/tailwind.css` loaded by `src/app/globals.css`, which holds
    the shadcn neutral theme unchanged. Geist and Geist Mono through `next/font/google`. The
    old color tokens, gradients, shadows, radii and decorative classes are gone
    (`838795d6`).
  - [x] Every ui component in use regenerated with the shadcn CLI (`base-nova` on Base UI)
    and its call sites moved off Radix; the app's own tags, embed field, file upload and run
    name dialog rebuilt on them; 19 unused components removed with their packages (every
    `@radix-ui/*`, `clsx`, `tailwind-merge`, `next-themes`, `vaul`, `recharts` and others)
    (`7c113bd0`).
  - [x] Layout blocks in `src/components/layout/` ([DESIGN.md](../../DESIGN.md#shells-and-layout-blocks)),
    the public shell (header on a `NavigationMenu`, a menu sheet on phones, footer) and the
    console shell on shadcn's Sidebar block (`6ec8bf6c`).
  - [x] Home, the template library and the public template page rebuilt from the blocks,
    with the same behavior, states, links and wording (`47b56087`).
  - [x] SERP's UI runbook: the [UI app map](../../design-docs/ui-app-map.md) and the [screen
    inventory](../../design-docs/ui-screen-inventory.md), with a proof pass for every step 1
    screen on screenshots at 1440x900 and 390x844, light and dark, signed out and in
    (kept locally in `tmp/design-review/step1/`) (`92a7f0e4`).
  - [x] Card and empty-state titles are headings again, and the browser specs follow the
    new shells (`9109323d`, `28eeb89d`).
  - [x] The full browser suite on one worker: 250 of 253 passed in 29 minutes. Two failures
    were regressions, now fixed: a Select trigger read its value plus Base UI's default "▼"
    (`1e90eaed`), and the sidebar's rows were shadcn's 32px instead of the console's 44px
    targets (`dbfe9435`). The third, a phone menu test whose page stalled for 5 seconds after
    the click, did not recur. The three specs then passed three times each (24 of 24).
  - [x] Gates on the final code: `pnpm run verify` (5,157 unit tests); `pnpm run
    build:worker` (Worker 14,576 KiB, 2,997 KiB gzipped, 114 KiB over the phase 2
    measurement); `pnpm run test:smoke` (24 of 24).
  - [x] The user's answers to step 1's open questions (decision log, 2026-09-29): header
    menus, one Run URL, the console home after sign-in, the Template Library name, one Start a
    Run dialog, an honest Run complete dialog, shared-run wording, the 404's shell, the
    Categories empty search, "Updated <date>" and My Templates' count (`09770730` to
    `3dd02d45`). Screenshots at 1440x900 and 390x844 are kept locally in
    `tmp/design-review/decisions/`. Gates: `pnpm run verify` (5,239 unit tests), the 25 browser
    specs the changes touch on the production build (112 of 112), `pnpm run test:smoke` (24 of
    24).
  - [x] Step 2: the screens the inventory marked "Not restyled yet (step 2)", in two parts.
    - [x] Step 2a: the signed-in console, the shared run and their overlays. The console page
      blocks (`280b6184`); My Templates (`031a5998`), My Runs (`da759424`), Template detail
      (`19cca04a`), Archive (`c3682e2f`), Import Templates (`354291dc`), Account Settings
      (`0e63f69f`, `6c668037`), the run page and the shared run (`c727ac5e`, `5c94b25b`), and
      the Template editor with a phone layout (`6aeec655`); the Organizations error as the
      plain Alert (`4ee44a2f`) and outline link buttons' border (`a21bb2e5`). With them, the
      brief's fixes: counts in the singular everywhere through one helper (TD-24,
      `757bec35`), a 404 that logs no error (`945435a0`), and no empty navigation landmark
      while a header menu is open (`c2811960`). Every step 2a card in the [screen
      inventory](../../design-docs/ui-screen-inventory.md) has its proof pass, on screenshots
      at 1440x900 and 390x844, light and dark, of each screen's states (filled, empty,
      loading) and overlays, kept locally in `tmp/design-review/step2-console/`. Gates on the
      final code: `pnpm run verify` (5,244 unit tests); the 45 browser specs the changes
      touch, on the production build (175 tests), after two spec fixes (a loose "Edit"
      locator that the new breadcrumb's title matched, `ba895fb7`, and the import summary
      spec, which still expected a sign-in to open Account Settings, `cd865dfb`), with a new
      spec for the editor on a phone (`63d9e44d`); `pnpm run test:smoke` (24 of 24); `pnpm run
      build:worker` (Worker 14,711 KiB, 3,032 KiB gzipped by `wrangler deploy --dry-run`,
      35 KiB over step 1).
    - [x] Step 2b: the public pages, the sign-in pages, the Organization invite and the 404
      page's content. Card titles take the heading level of where they sit (`f33d4784`), and
      the other pages' skipped levels are fixed (`d75ba5f7`); the sign-in pages on shadcn's
      login block (`48852222`) and the invite on the same card (`f41fcd1c`); Categories
      (`0c24ab72`); the filter toolbar and view buttons as layout blocks (`8c59de94`); a
      category page (`66725f27`) and the Public Profile (`821f9a37`) as detail pages, with the
      template page's loading and missing states shared (`44c2a7e0`); Features and the feature
      pages (`5e2c8746`), Pricing (`e3e2fbb5`), About (`6a5659ca`), Contact (`049cd5a7`) and
      the 404 page (`7aa1752a`); the Template Library's search labelled (`48c9aaef`). Every
      step 2b card in the [screen inventory](../../design-docs/ui-screen-inventory.md) has its
      proof pass, on screenshots at 1440x900 and 390x844, light and dark, signed out and
      signed in where the page differs, of each screen's states (form errors and successes,
      loading, errors, empty) kept locally in `tmp/design-review/step2-public/`.
      `tests/e2e/heading-outline.spec.ts` reads the heading outline of the public and console
      pages (`b6799d10`). Gates on the final code: `pnpm run verify` (5,255 unit tests); the 21
      browser specs the changes touch, on the production build (72 tests): 71 passed, and the
      Public Profile's layout test, which measured the old cards, passed once it followed the
      MediaCard (`8a9d7f7f`), as did the view-mode test on template screens; `pnpm run
      test:smoke` (24 of 24); `pnpm run build:worker` (Worker 14,821 KiB, 3,051 KiB gzipped by
      `wrangler deploy --dry-run`, 19 KiB over step 2a).
    - [x] The full browser suite on one worker after step 2: 264 of 265 passed in 29 minutes.
      The one failure, the completion dialog's double-click test, failed 1 in 5 reruns: the
      spec's own waits could push its second click past the 500 ms double-click window. It
      now clicks as soon as the dialog opens, and passed 10 of 10 (`e05b2897`).
- [x] Merged `origin/staging` at `848a31a8` in `1d179028`: #250 (Personal Run MCP hardening),
  #251 (promotion prep), #254/#255 (Run Key template tools) and #257 (per-key permissions),
  keeping every bug-hunt fix and every staging feature (decision log, 2026-09-30); follow-ups
  `a0577837` to `979dd935`. Agent Access gained the permission cards, with screenshots at
  1440x900 and 390x844, light and dark, kept locally in `tmp/design-review/merge-staging/`.
  Local D1 has migrations 0026 and 0027; production needs both (Left for launch). Gates:
  `pnpm run verify` (5,276 unit tests); `pnpm run test:local-d1` (44 tests); the 7 browser
  specs that touch Account Settings or Run Keys, on the production build: 22 of 23 passed, and
  the one failure ("an invite opened in another account offers to sign out and come back to
  it") fails the same way on the pre-merge commit `2675576e` when run alone, because wrangler's
  dev proxy drops its invite POST (`Network connection lost`, cloudflare/workers-sdk#14641);
  `pnpm run test:smoke` (24 of 24).
- [x] Run Key follow-ups on the merged template tools (decision log, 2026-09-30): the template
  Changelog names the Run Key behind an Agent's edit (`fc0fd8a4`), and TD-27 is closed:
  `get_template` reads any template in results of at most 32KB and `update_template` changes
  one section or task (`2bd9dbcf` to `35dfff67`). A template 1KB under the 768KB limit reads
  back exactly in 31 calls on local D1.

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
- 2026-09-29: **Restyle foundation as in the reference.** `src/app/globals.css` is the
  reference's file (Tailwind 4, `tw-animate-css`, `shadcn/tailwind.css`, the neutral theme)
  plus `@tailwindcss/typography` for Markdown, whose colors point at the theme tokens in
  unlayered rules (a layered rule loses to the plugin's defaults). `cn` comes from the `cn`
  package, as in the reference, instead of `clsx` and `tailwind-merge`. Vitest aliases
  `next/font/google` to a stub (`tests/support/nextFontGoogle.ts`), because only the
  Next.js compiler implements it. The app keeps its own theme code (`src/lib/theme.ts` and
  the boot script) rather than next-themes, and the sonner `Toaster` follows it.
- 2026-09-29: **Base UI, not Radix.** `asChild` became `render`; a link that looks like a
  button is a `Link` with `buttonVariants` (Base UI's `Button` gives what it renders button
  semantics); menu items render the `Link` and keep their menuitem role. The props that
  changed meaning are in [DESIGN.md](../../DESIGN.md#conventions): `Select` labels,
  `DropdownMenuLabel` inside a group, `AlertDialogAction` that does not close, and a
  `Switch` or `Checkbox` named by a sibling label. A dialog's outside press comes with a
  reason, which the Run complete dialog's repeat-click guard reads.
- 2026-09-29: **Unused components deleted, not regenerated:** accordion, aspect ratio,
  calendar, carousel, chart, context menu, drawer, form, hover card, input OTP, menubar,
  multi-select, pagination, radio group, resizable, slider, table, toggle and toggle
  group. The template editor uses react-hook-form's `FormProvider` directly. `FileUpload`
  takes the user's id as a prop, because a ui component may not read app state
  (`deps:check`).
- 2026-09-29: **Card titles are headings.** base-nova's `CardTitle` is a `div`; ours renders
  the `h3` it rendered before, so account sections and dashboard cards stay in the page's
  outline (the browser specs find them by it). `EmptyTitle` and `AlertTitle` stay `div`s,
  with a heading inside where the page needs one.
- 2026-09-29: **Header links without dropdowns.** The reference groups its links under
  menus. The header has three single-destination links (Templates, Features, Pricing), so
  a menu would either hide a one-click link or add links the header does not have. It is
  an open question for the design owner in the screen inventory.
- 2026-09-29: **Console shell on shadcn's Sidebar block.** It replaces the dashboard
  sidebar, the site header over console pages, the phone menu and the bottom bar. The
  sidebar holds the brand, the context switcher, the console links (Categories joins them
  from the old phone menu), the theme toggle and the account menu; the top bar holds the
  sidebar trigger and, from `md` up, the site links. On phones the sidebar is a sheet, so
  the context switcher is one tap away instead of always on screen.
- 2026-09-29: **Sidebar state lasts until a full page load.** shadcn's block reads the
  collapsed state from a cookie on the server, which would render every console page per
  request instead of from the static cache.
- 2026-09-29: **Home without category tiles.** The reference's category tiles would need
  the public catalog, which Home must not load
  (`tests/unit/contexts/catalogConsumers.test.ts`).
- 2026-09-29: **Public template page as a detail page.** A breadcrumb replaces "Back" (the
  same destination). The sticky header with the actions is gone: the actions sit in the page
  header, and the closing banner keeps Save and Start Run.
- 2026-09-29: **Console targets stay full-size.** shadcn's sidebar rows are 32px tall; the
  old console's links were 44px (`min-h-11`), and a browser test holds them to it. The
  sidebar's rows take 44px (`h-11`), the one sizing change to the block; collapsed to icons
  they keep shadcn's 32px squares.
- 2026-09-29: **One Run URL.** A Run's page answered at `/run/<id>/` (the runs list's links)
  and at `/dashboard/runs/<id>/` (where Start Run went). The user chose
  `/dashboard/runs/<id>/`: the `/run/[id]` page is gone, and `/run/<id>` answers 308 with the
  Run's URL, keeping the query, next to the other legacy paths in `next.config.ts`.
  `buildRunPath` and the unused `buildRunUrl` went with it; the MCP endpoint and Run Keys
  return no page URLs, so nothing else changed.
- 2026-09-29: **Sign-in opens the console home.** With no return path, sign-in went to
  Account Settings. The user chose the console home (`buildConsoleHomePath()`, My Templates):
  `getPostSignInDestination` in `src/lib/auth/returnPath.ts` gives it to the login page, which
  email verification and password reset end on, and sign-up without verification uses it too.
- 2026-09-29: **Account menu without "Dashboard".** Its "Dashboard" and "My Templates" both
  opened `/dashboard/templates/`. The user kept "My Templates", the name the spec uses with
  My Runs.
- 2026-09-29: **One name for the library: Template Library.** The `/templates/` page was
  "Discover Templates", "Discover" in the sidebar and "Browse Templates" on buttons. The user
  added **Template Library** to the glossary and asked for it everywhere the page is named:
  its heading and metadata, the sidebar, the breadcrumb, the empty states and the calls to
  action ("Browse the Template Library"). My Runs' empty-state button, which opened My
  Templates under that label, now opens the library its label names. The header's
  "Templates" stays. ESLint's vocabulary rule flags the old names in UI code.
- 2026-09-29: **Header menus.** The user asked for the reference's dropdowns (this supersedes
  "Header links without dropdowns" above): "Templates" lists the Template Library and
  Categories, "Features" the four feature pages, and "Pricing" stays a link
  (`SiteNavigationMenu`, shadcn's NavigationMenu on Base UI). Each link carries its page's own
  description, so the menus add no new copy. The phone sheet shows the same menus as labelled
  groups, the console's top bar uses the same component, and the footer gains a "Templates"
  column with the same two links, so `/categories/` is linked from the header and the footer.
  The `/features/` overview is no longer in the header (Home's "Explore Features" and "Back to
  Features" reach it); the Features menu shows as current there. Closed menus stay in the HTML,
  hidden (`keepMounted`), so crawlers keep finding the pages they link. A link closes its menu
  (`closeOnClick`), because the header stays mounted across client navigations.
- 2026-09-29: **"Updated <date>" on the public template page**, as the reference's detail
  pages show it. The public template response already carries `updated_at`
  (`PUBLIC_TEMPLATE_FIELDS`), so nothing changed in the API or its D1 reads; the page formats it
  like template detail's "Last updated" (`formatLocalDate`, in the viewer's zone). The page
  loads its template in the browser, so the server never renders a date in another zone.
- 2026-09-29: **One Start a Run dialog.** My Templates had its own dialog ("Start Run", a
  Template select, unlabelled fields), Template detail asked "Name Your Checklist Run" with
  "Start Checklist", and the public template page started a Run without asking. All three now
  open `RunNameDialog`: "Start a Run", a labelled "Run name" field suggesting the default name,
  "Start Run" ("Starting…" while pending) and Cancel. My Templates' Template select is gone,
  since every Start Run there comes from a Template's card or row. The public template page
  still sends a visitor who is not signed in to sign in first. The dialog ignores the rest of
  the double click that opened it, as the Run complete dialog does, and a double click on its
  Start Run submits once.
- 2026-09-29: **An honest Run complete dialog.** Its one button read "Return to Dashboard" or
  "Return to Public Runs" (a page that does not exist) and completed the Run. It now asks
  "Complete this Run?", says every task is done and that completing freezes the tasks, and
  offers "Complete Run" and "Not yet" in theme colors; completing says "Run completed". The
  owner or a member then goes to My Runs, while a guest on a share link stays on the shared
  run, which shows a "Completed" badge. The double-click guard covers both buttons.
- 2026-09-29: **Shared runs are not read-only.** The API always let a share link tick tasks and
  Sub-tasks, write notes and complete the Run (never rename or delete it); the shared page
  ("A read-only checklist run") and Home ("a clean read-only run") said otherwise. They, and
  the Share run dialog, now say what anyone with the link can do. The API is unchanged.
- 2026-09-29: **The 404's shell follows the session.** `src/app/not-found.tsx` rendered the
  shell the path picks, so a signed-out visitor to a missing `/dashboard/` path saw console
  chrome, and the prerendered 404 (the public shell, for `/_not-found/`) did not match the first
  client render there. `NotFoundLayout` renders the public shell in the HTML and until the
  session check answers, then gives a signed-in user on a missing console path the console
  shell, following the useIsClient pattern of the 404 hydration fix (`91dac1ae`).
- 2026-09-29: **Categories' empty search.** A category search that matched nothing showed an
  empty list. It now shows the shared empty state ('No categories match "<query>"') with Clear
  search, which restores the list and the search field's focus. The rest of the page waits for
  step 2 of the restyle.
- 2026-09-29: **My Templates' count.** Its subtitle read "1 templates in your library", and
  "0 templates in your library" while the list loaded. It now says "1 template" or "N
  templates", and shows no count until the list has loaded (nor after it failed to load).
- 2026-09-29: **Kept as they are, by the user's choice:** icon tiles stay neutral (no custom
  colors); the phone context switcher stays in the sidebar sheet; the Template editor's phone
  layout comes with step 2, with every other screen's. The questions these changes raised are
  in the screen inventory's [open questions](../../design-docs/ui-screen-inventory.md#open-questions),
  and counts that still say "1 templates" are TD-24.
- 2026-09-29: **The Template editor on phones.** Below `lg` the editor is one column, and the
  outline opens in a bottom sheet from an "Outline" button in the editor's top bar. Picking or
  adding an entry closes the sheet and moves focus to that entry's form heading, scrolled into
  view under the top bars. HTML5 drag and drop needs a mouse, so a touch screen shows Move up
  and Move down buttons on every section, task and content block in place of the drag handle,
  chosen by CSS on the pointer (`pointer-coarse`, `pointer-fine`); each move keeps focus on
  the moved entry and is announced, as the arrow keys' moves are. A mouse still drags and the
  keyboard still uses the arrow keys. On a phone, Preview moves into "More actions" and the
  theme toggle leaves the top bar (the sidebar has one), so the title and Save keep their
  room. Saving, validation, the unsaved-changes guard and the locks while a create saves or a
  Clipy draft generates are unchanged; the sheet renders outside the page's locked fieldset,
  so it has its own. Rejected: a separate phone editor (a second form to keep in step), and a
  touch drag library (a new dependency, and dragging inside a scrolling sheet is fiddly).
- 2026-09-29: **Every field shows its label.** The brief asks for visible labels on every
  field, on phones too. The console's filters now show "Search", "Visibility", "Sort by" and
  "Status"; fields only screen readers could name show theirs ("Public Clipy video link",
  "Share link", "Run title", and a member's "Role" and "Status" on phones); the avatar's
  hover-only "Upload avatar" and "Remove avatar" icons, which phones never showed, are
  visible buttons. The new words are open questions in the screen inventory.
- 2026-09-29: **Deletes ask in an alert dialog.** My Templates' and My Runs' delete dialogs
  closed on a click outside; Template detail's was an alert dialog. All three, and Revoke Run
  Key, now share `ConfirmDialog` (the shadcn AlertDialog, its action destructive and waiting
  while it runs), which only Cancel or Escape closes.
- 2026-09-29: **Account Settings stays one column.** Its card proposed a section nav or Tabs.
  The page has no navigation today and the brief says to invent nothing, so it is one column
  of shadcn Cards (an open question in the inventory).
- 2026-09-29: **The Template preview keeps its renderer.** Its card proposed the public page's
  "What's included" block. `PublicTemplateContent` carries tested behaviors (Clipy key-moment
  images, the player's source link, file and embed links) that would have to move with it, so
  step 2a only restyled it (an open question).
- 2026-09-29: **`buttonVariants` merges its classes.** shadcn's base-nova button puts
  `border-transparent` in its base classes and `border-border` in the outline variant.
  `Button` merges them with `cn`, but a link styled with `buttonVariants` did not, so the
  transparent border won and outline link buttons had no border in the light theme.
  `buttonVariants` now merges; DESIGN.md lists it with the other changes to generated
  components.
- 2026-09-29: **Card titles take their heading level.** `CardTitle` rendered an `h3` everywhere,
  so a card right under a page's `h1` skipped a level (Account Settings, Import Templates,
  Archive, template detail, the editor's Generate from Clipy, the invite page, which had no
  `h1` at all). It stays an `h3` by default and takes `as` for the level where the card sits:
  the console's cards pass `h2` and their inner headings move to `h3`, and the app's crash
  card is its `h1`. The generated component keeps this one prop (DESIGN.md). The same audit
  fixed the other skips: Home's workflow steps, the library's and My Templates' cards and
  the library's empty and failed states are `h2`s; Sub-tasks sits one level under its task
  or section list; the footer's column titles are `h2`s, so a page whose last heading is its
  `h1` never jumps to `h3`. A browser spec reads the outline of the public and console
  pages, and every step 2b screenshot was checked for it.
- 2026-09-29: **The sign-in pages on shadcn's login block.** Log in, Register, Forgot password
  and Reset password share `AuthCard`, the two-column form of the block: the form in one
  column and, from `lg`, the existing "Built for repeatable work" aside in the muted column
  where the block shows an image (kept, since dropping it would drop content; an open
  question). The password fields are `PasswordInput` on the shadcn InputGroup with the same
  show and hide names; the amber verification notice and the dashed message boxes are Alerts
  (the notice stays a polite status); the development persona buttons lost their colored
  dots. The Organization invite uses `AuthCard` without the aside; its title is now the page's
  `h1`, its buttons stack across the card, and its errors are Alerts. Categories, the
  category page and the invite each nested a second `<main>` in the shell's; none does now.
- 2026-09-29: **Detail pages for a category, a feature and a Public Profile.** They use
  `DetailPageLayout`, whose breadcrumb is now its own block (`PageBreadcrumb`). A feature
  page's breadcrumb "Features" replaces "Back to Features", as the template page's "Template
  Library" replaced "Back"; a category page's breadcrumb keeps the back link's words, "All
  Categories". A profile has no section to trail back to, so its breadcrumb is left out, and
  `DetailPageLayout` gained `media` (the avatar) and a `subtitle` (the handle). Its header is
  a `div`: inside `<main>` a `<header>` is no landmark, and the parity test holds a public
  page to one `<header>`, the site's.
- 2026-09-29: **Blocks from the patterns that repeat.** The console's filter row
  (`DashboardToolbar`) became the layout block `Toolbar`, which a category page shares with
  My Templates and My Runs, with `ViewModeToggle` for the grid and list buttons; the
  template page's loading and missing states are `PageLoadingState` and `PageEmptyState`,
  which the Public Profile uses too; `ListCard` takes a heading level and actions (Contact),
  and `CardGrid` one column (a category page's list view). What nothing used any more went:
  `Surface`, `PublicPageLayout`, the shared `EmptyState` and `LoadingSpinner`, the
  `SearchAndFilters` wrapper, and the category colors in `categoryPresentation.ts`.
- 2026-09-29: **Every public field shows its label.** The search on Categories ("Search
  categories", its hidden name before), on the Template Library ("Search templates"; it had
  no name) and on a category page ("Search" and "Sort by", as on My Templates). The wording
  is an open question in the screen inventory.
- 2026-09-30: **Staging's Run Key work on this branch's code.** Staging moved the web
  template create and update into `createTemplateForUser` and `updateTemplateForUser`; the
  merge keeps that split with this branch's fixes inside, so Run Key writes get them too
  (payload details, content limits, the capacity-checked insert, slug retries, required
  versions, no-op saves, guarded audit-first batches, run reconcile events). The template
  tools use this branch's MCP helpers (`agentMcpTools.ts`, `agentMcpRuns.ts`) instead of
  staging's `utils/mcp-tools.ts`: one `ToolError` class, arguments that name the bad field and
  treat null as absent, and sections read with the ids a save stores. Staging's
  `utils/template-assets.ts` went: this branch had moved those helpers into `src/lib/schemas/`.
  A Run Key edit's batch also requires the template to still be private, which closes
  staging's TD-18; the capacity-checked insert had closed its TD-19. Its TD-16 and TD-20 became
  TD-25 and TD-26 (TD-24 was used and closed here). The failed-authentication limit counts an
  IPv6 client per /64, like the router's limits. The template update batch moved to
  `utils/template-writes.ts`, keeping `templates.ts` under its line cap.
- 2026-09-30: **The template Changelog names the Run Key from the audit event.** A version
  row records only the user; the audit event its write records holds the key. The history API
  gives each version that event's `metadata` (the field run history events carry), looked up in
  the events it already reads with the same limit, which always hold the event of every version
  the Changelog shows, so D1 reads nothing more. Joining `audit_events` in the version query
  was rejected: up to 8 more rows read on every template page.
- 2026-09-30: **MCP template results within 32KB, and edits a part at a time (TD-27).**
  get_template's 512KB bound was far past what clients take whole: Claude Code sets a result
  over 25,000 tokens aside in a file (`MAX_MCP_OUTPUT_TOKENS`), and Codex cuts the middle out of
  one over its model's 10,000 tokens plus 20%, counted as 4 bytes each. So get_template,
  create_template and update_template results stay within 32KB, and a larger template reads as
  an outline, a section or task at a time, pages of whole tasks, and parts of JSON text for
  anything larger on its own, so every template that can exist reads in full. Capping what
  MCP writes may store was rejected: web and older templates would still be unreadable.
  Cursors hold the version, so pages never mix versions. `update_template` gained operations
  on one section or task: taking the whole checklist back from a template read in pages would
  need more than any one result (and more than a model writes in one call), and anything the
  agent dropped would be removed. The whole-checklist `sections` stays for templates an agent
  can send whole; whether to refuse it for a template too large to read at once is left to the
  user. The other MCP results keep their 512KB bound (TD-28).
