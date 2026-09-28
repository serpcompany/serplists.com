# Architecture

SERP Lists is a React single-page app (`src/`) served by Cloudflare Pages, with a
Pages Functions API (`functions/`) backed by D1 (SQL) and R2 (files). This page is
the top-level map. Request flow, routes, and the data model are in the
[system overview](docs/design-docs/system-overview.md); product terms are defined in
[PRODUCT_SENSE.md](docs/PRODUCT_SENSE.md); the current tables are in
[generated/db-schema.md](docs/generated/db-schema.md).

## Business domains

| Domain | API (`functions/api/`) | App (`src/`) |
| --- | --- | --- |
| Identity and sessions | `better-auth.ts`, `handlers/auth.ts`, `utils/session.ts` | `contexts/CloudflareAuthContext.tsx`, `lib/auth/` |
| Personal and Organization ownership | `handlers/teams.ts`, `utils/team-access.ts` | `contexts/WorkspaceContext.tsx`, `features/teams/` |
| Templates | `handlers/templates.ts`, `utils/payloads.ts`, `utils/template-reconciliation.ts`, `utils/template-writes.ts` | `contexts/TemplatesContext.tsx`, `features/template-*`, `lib/templates/` |
| Runs | `handlers/checklists.ts`, `handlers/checklists-shared.ts`, `utils/checklist-runs.ts`, `utils/run-access.ts`, `utils/shared-run-merge.ts`, `utils/share-link-actors.ts`, `utils/template-access.ts` | `features/run-execution/`, `features/dashboard-runs/` |
| Billing and entitlements | `handlers/billing.ts`, `handlers/stripe.ts`, `utils/entitlements.ts`, `utils/active-run-limit.ts`, `utils/guarded-insert.ts` | `lib/billing.ts`, `pages/Pricing.tsx` |
| Agent access (Run Keys, MCP) | `handlers/agent-keys.ts`, `handlers/agentMcp.ts`, `utils/personal-run-key.ts` | `components/account/AgentAccessSection.tsx` |
| Public discovery and SEO | `functions/sitemap*`, `functions/categories/` | public `pages/`, `data/` |
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
  pages/*  ->  components/*  ->  features/*, contexts/*, hooks/*  ->  lib/api.ts  ->  HTTP
                  components/ui/* (presentational primitives only)

Shared (imported by both sides)
  src/lib/schemas/*, src/types/*, and the modules allowlisted in .dependency-cruiser.cjs
```

## Enforced rules

`pnpm run deps:check` (dependency-cruiser, config in
[.dependency-cruiser.cjs](.dependency-cruiser.cjs)) fails on:

- `functions/` importing anything from `src/` except allowlisted framework-free modules
- shared modules importing React, UI, contexts, hooks, or the browser API client
- `src/` importing from `functions/`
- pages and components calling `src/lib/api.ts` directly (type-only imports are allowed)
- `src/components/ui/` depending on app state, features, pages, or the API client
- `functions/api/utils/` importing handlers; `db/schema/` importing application code
- runtime code importing tests or devDependencies; circular imports

Violations that predate a rule are listed in
`.dependency-cruiser-known-violations.json`. They are debt to burn down, not
precedent: never re-baseline to make new code pass.

Other invariants (Zod at API boundaries, structured logging, product vocabulary,
file size) are listed with their enforcement in
[core beliefs](docs/design-docs/core-beliefs.md).

## Stack

Versions are pinned in `package.json`. Several libraries changed APIs after our
versions, so read the vendored docs in [docs/references/](docs/references/) or the
versioned links below rather than relying on memory.

| Layer | Choice (version) | Reference |
| --- | --- | --- |
| UI | React 18, Vite 5, React Router 6, TanStack Query 5 | [React Router 6.28 docs](https://reactrouter.com/6.28.0/start/overview) |
| Components and styling | shadcn/ui (Radix), Tailwind CSS 3 | [shadcn-ui-llms.txt](docs/references/shadcn-ui-llms.txt), [Tailwind v3](https://v3.tailwindcss.com/docs) |
| Validation | Zod 3 (not 4), `@t3-oss/env-core` | [v3.zod.dev](https://v3.zod.dev/) |
| API runtime | Cloudflare Pages Functions, Wrangler 4 | [cloudflare-pages-llms.txt](docs/references/cloudflare-pages-llms.txt) |
| Data | Cloudflare D1 with Drizzle ORM 0.45 / Kit 0.31; R2 for uploads | [cloudflare-d1-llms.txt](docs/references/cloudflare-d1-llms.txt), [drizzle-llms.txt](docs/references/drizzle-llms.txt) |
| Auth | Better Auth 1.3.4 (exact pin; current docs describe newer releases) | [authentication](docs/design-docs/authentication.md) |
| Billing | Stripe REST API via `fetch` (no SDK) | [stripe-llms.txt](docs/references/stripe-llms.txt), [billing](docs/design-docs/billing.md) |
| SEO | XML sitemaps generated by Pages Functions | [xml-sitemap-standards.md](docs/references/xml-sitemap-standards.md) |
| Tests | Vitest 3, Playwright | [vitest-llms.txt](docs/references/vitest-llms.txt) |
| Tooling | pnpm 9, ESLint 9, dependency-cruiser, Lefthook | |

Refresh the vendored files with `pnpm run docs:references`.
