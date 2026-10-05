# Architecture

SERP Lists is a Next.js app (`src/`) that runs on Cloudflare Workers through OpenNext.
The same Worker serves the pages and the API (`functions/api/`, run by the route handler
`src/app/api/[[...route]]/route.ts`), backed by D1 (SQL) and R2 (files). This page is the
top-level map. Request flow, routes, and the data model are in the
[system overview](docs/design-docs/system-overview.md); how the app calls the API and caches
what it reads is in [client data](docs/design-docs/client-data.md); product terms are defined in
[PRODUCT_SENSE.md](docs/PRODUCT_SENSE.md); the current tables are in
[generated/db-schema.md](docs/generated/db-schema.md).

## Business domains

| Domain | API (`functions/api/`) | App (`src/`) |
| --- | --- | --- |
| Identity and sessions | `better-auth.ts`, `handlers/auth.ts`, `utils/session.ts` | `contexts/AuthProvider.tsx`, `contexts/CloudflareAuthContext.tsx`, `lib/auth/` |
| Personal and Organization ownership | `handlers/teams.ts` (the router), `handlers/team-create.ts`, `handlers/team-settings.ts`, `handlers/team-membership.ts`, `handlers/team-invites.ts`, `handlers/team-invite-links.ts`, `handlers/team-invite-accept.ts`, `handlers/team-self-service.ts`, `utils/team-access.ts` | `contexts/WorkspaceProvider.tsx`, `contexts/WorkspaceContext.tsx`, `features/teams/` |
| Templates | `handlers/templates.ts` (the router), `handlers/template-reads.ts`, `handlers/template-create.ts`, `handlers/template-update.ts`, `handlers/template-archive.ts`, `handlers/template-clone.ts`, `handlers/template-backup.ts`, `utils/template-rows.ts`, `utils/template-permissions.ts`, `utils/payloads.ts`, `utils/template-reconciliation.ts`, `utils/template-identities.ts`, `utils/template-changes.ts`, `utils/template-portable.ts`, `utils/template-writes.ts`, `utils/history-queries.ts` | `contexts/TemplatesContext.tsx`, `features/template-*`, `lib/templates/` |
| Runs | `handlers/checklists.ts` (the router), `handlers/checklists-reads.ts`, `handlers/checklists-create.ts`, `handlers/checklists-update.ts`, `handlers/checklists-revalidate.ts`, `handlers/checklists-share-link.ts`, `handlers/checklists-archive.ts`, `handlers/checklists-shared.ts`, `utils/checklist-runs.ts`, `utils/run-access.ts`, `utils/run-completion.ts`, `utils/shared-run-merge.ts`, `utils/share-link-actors.ts`, `utils/template-access.ts` | `features/run-execution/`, `features/dashboard-runs/`, `features/guest-runs/` (runs kept in a signed-out visitor's browser) |
| Billing and entitlements | `handlers/billing.ts`, `handlers/stripe.ts`, `utils/entitlements.ts`, `utils/active-run-limit.ts`, `utils/guarded-insert.ts`, `utils/limit-reached.ts` | `lib/billing.ts`, `views/Pricing.tsx` |
| Agent access (Run Keys, MCP) | `handlers/agent-keys.ts`, `handlers/agentMcp.ts`, `handlers/agentMcpRunTools.ts`, `handlers/agentMcpTools.ts`, `handlers/agentMcpTemplateTools.ts`, `handlers/agentMcpRuns.ts`, `handlers/agentMcpRunPages.ts`, `handlers/agentMcpPages.ts`, `handlers/agentMcpLists.ts`, `handlers/agentMcpTemplates.ts`, `handlers/agentMcpTemplatePages.ts`, `handlers/agentMcpTemplateEdits.ts`, `utils/agent-mcp-host.ts`, `utils/mcp-limits.ts`, `utils/personal-run-key.ts` | `components/account/AgentAccessSection.tsx`, `lib/schemas/runKeyPermissions.ts` |
| Public discovery and SEO | `functions/sitemap/` (served by the route handlers in `src/app/sitemap.xml` and `src/app/sitemaps`), `functions/seo/` (lookups for page metadata) | public `views/`, `data/`, `lib/publicPageMeta.ts`, `lib/seo/`, `server/pageMeta/` (each page's metadata, rendered on the server; see docs/FRONTEND.md), `app/robots.ts`, `lib/http/urlStandard.ts` (the canonical URL form and the redirects `next.config.ts` builds from it) |
| Imports and uploads | `handlers/clipy.ts`, `handlers/uploads.ts` | `lib/schemas/portableTemplate*`, `components/TemplateBackup.tsx` |

Legacy `team`/`workspace` identifiers in code mean Organization; see
the [Personal and Organization contexts decision](docs/design-docs/personal-and-organization-contexts.md).

## Layers

Dependencies point one way. Arrows mean "may import".

```text
API (functions/)
  [[route]].ts  ->  handlers/*  ->  utils/*  ->  db.ts  ->  db/schema/*
  (CORS, rate      (parse input,   (session,    (Drizzle)   (tables only)
   limit, request   authorize,      entitlements,
   id, logging)     respond)        audit, logger)

App (src/)
  app/* (routes)  ->  views/*  ->  components/*  ->  features/*, contexts/*, hooks/*  ->  lib/api.ts  ->  HTTP
                                     components/ui/* (presentational primitives only)
  app/* (server side: metadata, route handlers)  ->  server/*  ->  functions/ (the API, sitemaps, lookups)

Shared (imported by both sides)
  src/lib/schemas/*, src/types/*, and the modules allowlisted in .dependency-cruiser.cjs
```

## Enforced rules

`pnpm run deps:check` (dependency-cruiser, config in
[.dependency-cruiser.cjs](.dependency-cruiser.cjs)) fails on:

- `functions/` importing anything from `src/` except allowlisted framework-free modules
  (those import each other by relative path, since the API's TypeScript project,
  `functions/tsconfig.json`, has no `@/` alias)
- shared modules importing React, UI, contexts, hooks, or the browser API client
- `src/` importing from `functions/`, except the route files in `src/app` and `src/server`
- client code (views, components, hooks, contexts, features) importing `src/server`
- views and components calling the API client (`src/lib/api.ts`, `src/lib/api/`) directly (type-only imports are allowed)
- `src/components/ui/` depending on app state, features, pages, or the API client
- `functions/api/utils/` importing handlers; `db/schema/` importing application code
- runtime code importing tests or devDependencies; circular imports. npm packages stay in the
  graph, unfollowed, so the rules about packages see them: the `exclude` option names only
  build output at the repository root (`tests/unit/config/dependency-graph.test.ts`)
- a module in `src/` or `functions/` that no route file in `src/app` and not
  `next.config.ts` (the security headers) reaches: dead code, with no folder exempt. Code
  only a script uses lives in `scripts/lib`, as the portable template JSON Schema builder
  and the README renderers do.

There is no baseline of known violations: every violation fails the check, so fix
the code rather than the rule.

knip (`pnpm run deadcode:check`) covers the rest of the repository from the entry points its
tools load (scripts, tests and configs as well as the route files): unused files, exports
and packages, and packages used without being listed
([repository checks](docs/RELIABILITY.md#repository-checks)).

Other invariants (Zod at API boundaries, structured logging, product vocabulary,
file size) are listed with their enforcement in
[core beliefs](docs/design-docs/core-beliefs.md).

## Stack

Versions are pinned in `package.json`. Several libraries changed APIs after our
versions, so read the vendored docs in [docs/references/](docs/references/) or the
versioned links below rather than relying on memory.

| Layer | Choice (version) | Reference |
| --- | --- | --- |
| UI | Next.js 16 (App Router, Turbopack), React 19, TanStack Query 5 | `node_modules/next/dist/docs/` (the docs for the installed version) |
| Components and styling | shadcn/ui (Radix), Tailwind CSS 3 | [shadcn-ui-llms.txt](docs/references/shadcn-ui-llms.txt), [Tailwind v3](https://v3.tailwindcss.com/docs) |
| Validation | Zod 3 (not 4), `@t3-oss/env-core` | [v3.zod.dev](https://v3.zod.dev/) |
| Runtime | Cloudflare Workers through OpenNext (`@opennextjs/cloudflare`), Wrangler 4; the API runs in the same Worker | [OpenNext for Cloudflare](https://opennext.js.org/cloudflare) |
| Data | Cloudflare D1 with Drizzle ORM 0.45 / Kit 0.31; R2 for uploads | [cloudflare-d1-llms.txt](docs/references/cloudflare-d1-llms.txt), [drizzle-llms.txt](docs/references/drizzle-llms.txt) |
| Auth | Better Auth 1.3.4 (exact pin; current docs describe newer releases) | [authentication](docs/design-docs/authentication.md) |
| Billing | Stripe REST API via `fetch` (no SDK) | [stripe-llms.txt](docs/references/stripe-llms.txt), [billing](docs/design-docs/billing.md) |
| SEO | Page metadata from the Next.js Metadata API, XML sitemaps from route handlers; SERP's URL standard (pages end in `/`, files and the API never do) and environment configuration standard (`SITE_ENV`, one host per environment) | [xml-sitemap-standards.md](docs/references/xml-sitemap-standards.md), [URL trailing slash](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/url-trailing-slash.md), [environment configuration](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/environment-configuration.md) |
| Tests | Vitest 3, Playwright | [vitest-llms.txt](docs/references/vitest-llms.txt) |
| Tooling | pnpm 9, ESLint 9, dependency-cruiser, Lefthook | |

Refresh the vendored files with `pnpm run docs:references`.
