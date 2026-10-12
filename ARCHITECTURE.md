# Architecture

A map of the repository's parts, how data moves between them, and the layers inside each part.
Each part's own doc has the detail. Every layer rule here is checked, and so is every absence the
invariants below state.

## Parts

| Part | What it holds | Its doc |
| --- | --- | --- |
| `src/` | The Next.js app (App Router): routes in `src/app`, screens, components, the browser's data and state, and the server side that renders page metadata and serves the sitemaps | [`frontend.md`](docs/agents/frontend.md), [`client-data.md`](docs/agents/client-data.md) |
| `functions/` | The API (`functions/api/`), which `src/app/api/[[...route]]/route.ts` runs for every `/api/*` request; the sitemaps (`functions/sitemap/`) and page-metadata lookups (`functions/seo/`) the app's server side reads | [`system-overview.md`](docs/agents/system-overview.md) |
| `db/` | The Drizzle schema (`db/schema/`), the D1 migrations, and seed data | [`database-operations.md`](docs/agents/database-operations.md) |
| `scripts/` | Development, generators, data operations, the repository's checks (`scripts/checks/`) and its ESLint rules | [`development-environment.md`](docs/agents/development-environment.md), [`checks.md`](docs/agents/checks.md) |
| `tools/checks/` | Plain Node entry points that run before packages are installed: Claude Code's hooks, the pull request check, and the script that gives each checkout its ports | [`code.md`](docs/agents/code.md) |
| `tests/` | Unit tests (Vitest, in Node and happy-dom), local D1 tests, and browser tests (Playwright on the production build) | [`testing.md`](docs/agents/testing.md) |
| `.github/` | CI, deploys and the agent workflows, with their actions | [`ci.md`](docs/agents/ci.md) |

### Domains

Where each part of the product lives. Legacy `team` and `workspace` identifiers in code mean
Organization ([ADR 0001](docs/adr/0001-use-personal-and-organization-ownership-contexts.md)).

| Domain | API (`functions/api/`) | App (`src/`) |
| --- | --- | --- |
| Identity and sessions | `better-auth.ts`, `handlers/auth.ts`, `utils/session.ts` | `contexts/AuthProvider.tsx`, `contexts/CloudflareAuthContext.tsx`, `lib/auth/` |
| Personal and Organization ownership | `handlers/teams.ts` (the router), `handlers/team-*.ts`, `utils/team-access.ts` | `contexts/WorkspaceProvider.tsx`, `contexts/WorkspaceContext.tsx`, `features/teams/` |
| Templates | `handlers/templates.ts` (the router), `handlers/template-*.ts`, `utils/template-*.ts`, `utils/payloads.ts`, `utils/history-queries.ts` | `contexts/TemplatesContext.tsx`, `features/template-*`, `lib/templates/` |
| Runs | `handlers/checklists.ts` (the router), `handlers/checklists-*.ts`, `utils/checklist-runs.ts`, `utils/run-access.ts`, `utils/run-completion.ts`, `utils/shared-run-merge.ts`, `utils/share-link-actors.ts` | `features/run-execution/`, `features/dashboard-runs/`, `features/guest-runs/` (runs kept in a signed-out visitor's browser) |
| Billing and entitlements | `handlers/billing.ts`, `handlers/stripe.ts`, `utils/entitlements.ts`, `utils/active-run-limit.ts`, `utils/guarded-insert.ts`, `utils/limit-reached.ts` | `lib/billing.ts`, `views/Pricing.tsx` |
| Agent access (Run Keys, MCP) | `handlers/agent-keys.ts`, `handlers/agentMcp*.ts`, `utils/agent-mcp-host.ts`, `utils/mcp-limits.ts`, `utils/personal-run-key.ts` | `components/account/AgentAccessSection.tsx`, `lib/schemas/runKeyPermissions.ts` |
| Public discovery and SEO | `functions/sitemap/` (`listedOwners.ts` decides which Profile Owners are listed), `functions/seo/`, `handlers/profile-directory.ts`, `utils/profile-directory.ts` | public `views/`, `data/`, `lib/publicPageMeta.ts`, `lib/seo/`, `server/pageMeta/`, `app/robots.ts`, `lib/http/urlStandard.ts` (the canonical URL form and the redirects `next.config.ts` builds from it) |
| Imports and uploads | `handlers/clipy.ts`, `handlers/uploads.ts` | `lib/schemas/portableTemplate*`, `components/TemplateBackup.tsx` |

## How data moves

One Cloudflare Worker, built by OpenNext, serves the pages and the API. D1 holds the data and R2
the uploaded files ([`system-overview.md`](docs/agents/system-overview.md)).

- **Browser to Worker.** Pages render per request, but those prerendered at build, which the
  Worker serves from its static assets. The browser calls `/api/*` through `src/lib/api.ts`, which
  parses each answer with its endpoint's schema. Better Auth's httpOnly cookies carry the session;
  the browser stores no token ([`client-data.md`](docs/agents/client-data.md)).
- **App server side to API, in the Worker.** Route handlers and `src/server` call the API's router
  directly (`src/server/api.ts`) and read the sitemaps and lookups in `functions/`.
- **API to D1.** Drizzle over the `DB` binding (`functions/api/db.ts`), on the tables in
  `db/schema/`. Migrations in `db/migrations/` are applied as a step of their own, and a deploy
  refuses to run with one pending ([ADR 0005](docs/adr/0005-deploys-refuse-pending-migrations.md)).
- **API to R2.** Uploaded files go to the `R2_UPLOADS` bucket and come back through `/api/uploads/`
  (`functions/api/handlers/uploads.ts`).
- **Shapes both sides share.** The API imports Zod schemas and pure helpers from `src/` (the
  modules `SHARED_FROM_SRC` lists in `.dependency-cruiser.cjs`), so a request and its answer have
  one definition.
- **Out of the Worker.** Stripe through its REST API, and Stripe's signed webhooks into
  `/api/stripe/webhook` ([`billing.md`](docs/agents/billing.md)); account email through Resend or
  useSend ([`authentication.md`](docs/agents/authentication.md)); a public Clipy recording,
  fetched to draft a Template (`functions/api/handlers/clipy.ts`).
- **Agents.** An agent works on a Run through the MCP endpoint `POST /api/mcp` with a Run Key
  ([`agent-access.md`](docs/agents/agent-access.md)).
- **Telemetry.** The Worker's logs go to Workers Logs, and the browser reports its errors to the
  API, which logs them ([`observability.md`](docs/agents/observability.md)).

## Layers

Imports point one way. An arrow means "may import": a layer may import any layer below it, and
never one above. Each rule is in `.dependency-cruiser.cjs`, checked by
`pnpm run verify dependencies`, and its failure says where the code belongs; each is proven by an
import it refuses (`tests/unit/config/layer-rules.test.ts`).

```text
API (functions/)
  api/[[route]].ts  ->  api/handlers/*  ->  services  ->  api/db.ts  ->  db/schema/*
  (CORS, rate         (parse input,       (below)       (Drizzle)      (tables only)
   limits, request     authorize,
   id, logging)        respond)
  services:      api/utils/*, api/better-auth.ts, api/env.ts, sitemap/* and seo/*
  observability: api/utils/logger.ts, d1-profiler.ts and request-context.ts, below every layer

App (src/)
  app/* (routes)  ->  views/*   ->  components/*  ->  features/*, contexts/*, hooks/*  ->  lib/*
                  ->  server/*  ->  components/* and below, and functions/
  components/ui/*: presentational primitives, with no app state, feature, hook or API client
  lib/* includes data/*, types/* and utils/*
```

| Rule | Holds |
| --- | --- |
| `handlers-import-no-router` | No handler imports `[[route]].ts`, which calls it |
| `api-services-import-no-handler-or-router` | The services import no handler and not the router |
| `db-module-builds-only-on-the-schema` | `db.ts` imports only `db/schema/`, the Worker's types and observability |
| `observability-imports-no-other-api-code` | Observability imports nothing else from `functions/` or `db/` |
| `db-schema-is-a-leaf` | `db/schema/` imports no application code |
| `views-import-no-route` | Views import no route |
| `components-import-no-route-or-view` | Components import no view or route |
| `features-contexts-and-hooks-import-no-screen` | Features, contexts and hooks import no component, view or route |
| `lib-builds-on-nothing-above-it` | `lib/`, `data/`, `types/` and `utils/` import none of the layers above |
| `server-imports-no-route-or-view` | `src/server` imports no route or view |
| `ui-primitives-stay-presentational` | `components/ui/` imports no context, feature, hook or API client |
| `screens-do-not-call-transport` | Views and components call the API client only for its types: a feature hook or context makes the call |
| `client-code-does-not-import-server-modules` | Only route files import `src/server` |
| `app-does-not-import-api-runtime` | Only the server side (`src/app`, `src/server`) imports `functions/` |
| `api-imports-only-shared-src` | `functions/` imports from `src/` only the modules `SHARED_FROM_SRC` lists |
| `shared-src-stays-framework-free` | Those shared modules import no React, Next.js or API client |

## Invariants

What the code never does, each held by a check ([`code.md`](docs/agents/code.md) has the rules):

- No import cycle, and no module in `src/` or `functions/` that no route, Next.js entry file or
  `next.config.ts` reaches (dependency-cruiser).
- No runtime code imports a test, or a devDependency for more than its types (dependency-cruiser).
- No `console.*` in `functions/` outside the logger, so every API log line is structured JSON
  (ESLint).
- No module but `src/lib/browserStorage.ts` touches `localStorage` or `sessionStorage`, none but the
  navigation wrappers imports `next/link` or Next.js's `useRouter`, and none renders `<img>` but
  `UserContentImage` (ESLint).
- No external data is cast to a type: it is parsed with Zod where it arrives (ESLint).
- No comment, in any file (ESLint and `pnpm run verify comments`).

## Stack

Versions are pinned in `package.json`. Several libraries changed their APIs after the versions
here, so read the vendored docs in [docs/references/](docs/references/) or the versioned links
below rather than relying on memory.

| Layer | Choice (version) | Reference |
| --- | --- | --- |
| UI | Next.js 16 (App Router, Turbopack), React 19, TanStack Query 5 | `node_modules/next/dist/docs/` (the docs for the installed version) |
| Components and styling | shadcn/ui in its `base-nova` style on Base UI (`@base-ui/react` 1), Tailwind CSS 4, lucide icons | [shadcn-ui-llms.txt](docs/references/shadcn-ui-llms.txt), [Base UI](https://base-ui.com/react/overview/quick-start), [Tailwind CSS](https://tailwindcss.com/docs), [`design.md`](docs/agents/design.md) |
| Validation | Zod 3 (not 4), `@t3-oss/env-core` | [v3.zod.dev](https://v3.zod.dev/) |
| Runtime | Cloudflare Workers through OpenNext (`@opennextjs/cloudflare`), Wrangler 4; the API runs in the same Worker | [OpenNext for Cloudflare](https://opennext.js.org/cloudflare) |
| Data | Cloudflare D1 with Drizzle ORM 0.45 and Kit 0.31; R2 for uploads | [cloudflare-d1-llms.txt](docs/references/cloudflare-d1-llms.txt), [drizzle-llms.txt](docs/references/drizzle-llms.txt) |
| Auth | Better Auth 1.3.4 (exact pin; current docs describe newer releases) | [`authentication.md`](docs/agents/authentication.md) |
| Billing | Stripe REST API through `fetch` (no SDK) | [stripe-llms.txt](docs/references/stripe-llms.txt), [`billing.md`](docs/agents/billing.md) |
| SEO | Page metadata from the Next.js Metadata API, XML sitemaps from route handlers; SERP's URL standard (pages end in `/`, files and the API never do) and environment configuration standard (`SITE_ENV`, one host per environment) | [xml-sitemap-standards.md](docs/references/xml-sitemap-standards.md), [URL trailing slash](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/url-trailing-slash.md), [environment configuration](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/environment-configuration.md) |
| Tests | Vitest 3 with happy-dom, Playwright | [vitest-llms.txt](docs/references/vitest-llms.txt) |
| Tooling | pnpm 9, ESLint 9, TypeScript 5, dependency-cruiser 17, knip 6, jscpd 4, Lefthook 2 | [`checks.md`](docs/agents/checks.md) |

`docs/references/` is a recorded addition to SERP's docs layout: vendored third-party docs for the
pinned versions. Refresh them with `pnpm run docs:references`.
