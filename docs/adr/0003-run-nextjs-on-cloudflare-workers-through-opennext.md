---
status: accepted
---

# Run Next.js on Cloudflare Workers through OpenNext

The app is a Next.js 16 App Router app (`src/app`) built with OpenNext's Cloudflare adapter
(`@opennextjs/cloudflare`) and served by one Worker per environment. The same Worker serves the
pages and the API: `src/app/api/[[...route]]/route.ts` hands every `/api/*` request to the router
in `functions/api/[[route]].ts`, on the pages' origin. D1 and R2 are bound to the Worker. It
replaced a Vite single-page app on Cloudflare Pages, with the API in Pages Functions.

Decided on 2026-09-29, when the owner approved the migration to the stack zenbujapanese.com's
website runs. Staging has run it since 2026-10-02 (#260), and serplists.com since 2026-10-07,
when #295 deployed the production Worker and the domain moved to it.

## Why

- **A normal web app, with no rewrite tricks.** The owner asked for real routes and server-side
  pages. Cloudflare runs full Next.js (server rendering, route handlers, dynamic routes) only on
  Workers, not on Pages.
- **Every public page has its own title and link preview.** The single-page app needed
  link-preview functions, a page shell for them and a rewrite rule for bots; with the Metadata API
  each page renders its own.
- **The stack the owner had approved** for zenbujapanese.com's website, which already ran Next.js
  on Workers through OpenNext, so this app had a working reference for each piece.

## Considered

- **A static export on Pages:** dynamic routes (`/profile/:handle/:slug/`, a Run's page) would need
  rewrite workarounds, which the owner ruled out.
- **vinext,** which Cloudflare lists first: it reimplements Next.js on Vite, and its repository
  says it isn't production-ready. OpenNext runs the real Next.js build.
- **Staying on the Vite single-page app:** no server rendering, and the link-preview workarounds
  stay.

## Consequences

- **Workers Paid.** When it shipped, the Worker was about 14.5 MiB, just under 3 MiB gzipped:
  at the edge of Workers Free's 3 MiB limit. Paid allows 10 MiB and lifts Free's 10 ms CPU
  limit.
- **Headers and redirects live in `next.config.ts`,** since the Worker answers every page. A
  `_headers` file still covers the static files Workers Static Assets serves without running the
  Worker, and each build writes it for its environment (`scripts/generate-static-headers.ts`).
- **Caching:** `open-next.config.ts` answers prerendered pages from the static assets cache
  without loading the Next.js server. That cache is read-only, so nothing revalidates on a timer.
- **The browser tests run the production build** in workerd (`opennextjs-cloudflare preview`), on
  one worker, since one workerd process renders every page.
- **Tooling follows OpenNext:** Wrangler 4.143, which it needs, patched so its dev proxy stops
  losing requests (`patches/`), and `node-linker=hoisted` in `.npmrc`, without which a Windows
  build bundles an unpatched Next.js.
- **The screens moved from the old pages folder to `src/views/`,** so Next.js doesn't read them as
  the Pages Router.
- **This Next.js differs from what models were trained on.** Read the guide for the installed
  version in `node_modules/next/dist/docs/` before writing Next.js code
  ([`AGENTS.md`](../../AGENTS.md)).
