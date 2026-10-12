# AGENTS

Routing only. Open the smallest source matching the task.

Stage: ship

Agents never merge: there is no `Agents may merge` line. Only an owner adds or changes these lines.

Stop and ask before: migrations or writes to staging or production D1, live Stripe keys or
billing state, deleting user data, product wording or pricing, and changing a rule in
[`docs/agents/code.md`](docs/agents/code.md).

## Every change

- [`docs/agents/code.md`](docs/agents/code.md): the rules all code follows (strict types, no
  comments, a size limit, no duplicate or dead code, imports that follow the layers, no secrets,
  a test for every fix), the checks and git hooks behind them, the skills, and when a change is
  done. Read it before the first change.
- [`docs/agents/verification.md`](docs/agents/verification.md): what to run while editing, before
  a push and at the finish gate, how to wait, the evidence a change needs, and a checkout's ports.

## Commands

- **Finish gate:** `pnpm run check`, once, on the finished tree.
- **Checks:** `pnpm run verify`, or some on some paths: `pnpm run verify comments,sizes <paths>`.
- **Inner loop:** `pnpm exec tsc -p <project> --noEmit`, `pnpm exec vitest related --run <files>`,
  and `pnpm run verify <checks> <paths>`.
- **Search** with `grep` and `find`, never `rg` or the Grep tool, which runs it: it spawns hundreds
  of processes and crashes VS Code here ([`agent-tooling.md`](docs/agents/agent-tooling.md)).
- **Before a push:** the tests the change touches, browser specs through
  `node --import tsx scripts/run-at-low-priority.ts pnpm run test:e2e:full <specs>`.
- **In the running product:** the skills `verify-web` (pages) and `verify-api` (the API, Run Keys
  and MCP), in `.claude/skills/`. Proof goes under `tmp/agent/verify/`.
- **Evidence:** a change a user sees needs its surface checked with that skill; a change to the
  build, routing, redirects or headers needs the production build (`pnpm run preview`,
  `pnpm run test:smoke`); a deploy change needs the deploy's checks on Staging.

## Codebase

- [`ARCHITECTURE.md`](ARCHITECTURE.md): the parts, how data moves between them, each part's
  enforced layers, and the pinned stack. Start here for anything that crosses parts.
- [`docs/product/index.md`](docs/product/index.md): what the product does today, page by page,
  and the check behind each behavior. Change a behavior, its doc and its check together.
- **How it fits together:** [`system-overview.md`](docs/agents/system-overview.md) (components,
  request flow, routes), [`data-persistence.md`](docs/agents/data-persistence.md) (tables, stored
  JSON, the migrations' history), [`client-data.md`](docs/agents/client-data.md) (the API client
  and the browser's cache), [`d1-cost.md`](docs/agents/d1-cost.md) (rows read and the query
  rules, before any query change), and the generated [`db-schema.md`](docs/api/db-schema.md).
- **Accounts and access:** [`authentication.md`](docs/agents/authentication.md) (Better Auth,
  sessions, email), [`organizations.md`](docs/agents/organizations.md) (members, roles, invites,
  context routes), [`agent-access.md`](docs/agents/agent-access.md) (Run Keys and MCP),
  [`billing.md`](docs/agents/billing.md) (Stripe and plans), and
  [`security.md`](docs/agents/security.md) (the auth model, secrets, CORS, rate limits).
- **Templates and Runs:** [`template-content-types.md`](docs/agents/template-content-types.md)
  (blocks and their stored shapes), [`template-editor.md`](docs/agents/template-editor.md) (the
  editor's form and saves), [`run-execution.md`](docs/agents/run-execution.md) (the Run page,
  saves, reconciliation, guest runs), and [`seo-and-sitemaps.md`](docs/agents/seo-and-sitemaps.md)
  (public pages' metadata, sitemaps, the Profiles directory).
- **The UI:** [`frontend.md`](docs/agents/frontend.md) (routes, URLs, data and state, leaving a
  page), [`design.md`](docs/agents/design.md) (shadcn on Base UI, layout blocks),
  [`ui-app-map.md`](docs/agents/ui-app-map.md) (every route and how it's reached), and
  [`ui-screen-inventory.md`](docs/agents/ui-screen-inventory.md) (each screen: open only its own).
- **Working on it:** [`development-environment.md`](docs/agents/development-environment.md) (setup,
  dev servers, every script), [`database-operations.md`](docs/agents/database-operations.md)
  (before changing the schema, a migration or a trigger), [`testing.md`](docs/agents/testing.md)
  (unit, local D1 and browser tests), [`checks.md`](docs/agents/checks.md) (how each check is set
  up), [`exceptions.md`](docs/agents/exceptions.md) (every exception and its reason), and
  [`agent-tooling.md`](docs/agents/agent-tooling.md) (Claude Code's tools and permissions).
- **CI and production:** [`ci.md`](docs/agents/ci.md) (every workflow and the checks a merge
  waits for), [`ci-deploys.md`](docs/agents/ci-deploys.md) (deploys and their checks),
  [`ci-agents.md`](docs/agents/ci-agents.md) (the review, `@claude` and weekly maintenance),
  [`environments.md`](docs/agents/environments.md) (hosts and configuration), and
  [`observability.md`](docs/agents/observability.md) (logs, error reports, incidents).
- [`docs/references/`](docs/references/): vendored docs for the pinned versions of Cloudflare,
  Drizzle, shadcn, Stripe and Vitest. Read them rather than relying on memory.

## Work tracking

- [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md): issues, labels, branches, pull
  requests and promotions. Plans live in issues.
- [`docs/quality.md`](docs/quality.md): a grade for each product area and layer, with the code it
  covers and the day it was graded. Re-grade a row when its tests, CI or docs change.
- [`docs/tech-debt.md`](docs/tech-debt.md), and [`docs/harness-debt.md`](docs/harness-debt.md)
  for the checks, delivery and the harness: known debt, each with its issue and a Size. Add debt
  you knowingly leave; remove what you pay off.

## Decisions

- [`docs/adr/`](docs/adr/): decisions that are hard to reverse, each with Why, Considered and
  Consequences. Read the ones the task touches. A record is superseded, never rewritten.
- [`CONTEXT.md`](CONTEXT.md): terms that are easy to confuse, such as Personal and Organization,
  Template Owner and Creator, or a guest run and a shared run.

## Where this differs from SERP's standards

[SERP's standards](https://github.com/serpcompany/serp/tree/main/docs/engineering/standards) apply;
where one says otherwise, these win:

- **No comments in code,** checked ([`code.md`](docs/agents/code.md), No comments).
- **Review runs on every push, beside CI,** and stays advisory until an admin requires resolved
  conversations ([`ci-agents.md`](docs/agents/ci-agents.md), Code review).
- **`staging` is the base, and `main` is Production and the default branch,** promoted by
  squash-merging a prepared branch, until the owner decides otherwise
  ([ADR 0002](docs/adr/0002-keep-staging-and-main-and-promote-by-squash-merge.md)).
- **A deploy refuses pending migrations** rather than applying them
  ([ADR 0005](docs/adr/0005-deploys-refuse-pending-migrations.md)).
- **Email goes through Resend or useSend,** not Cloudflare Email Sending: the setup predates the
  Transactional Email standard, and moving is the owner's call
  ([`tech-debt.md`](docs/tech-debt.md), Accounts and email).
- **`docs/references/` holds vendored third-party docs,** beside the standard layout
  ([`ARCHITECTURE.md`](ARCHITECTURE.md), Stack).

## This is NOT the Next.js you know

Read the guide for the installed version in `node_modules/next/dist/docs/` before writing Next.js
code, and heed its deprecation notices
([ADR 0003](docs/adr/0003-run-nextjs-on-cloudflare-workers-through-opennext.md)).
`agentRules: false` in `next.config.ts` keeps `next dev` from writing its own copy into this file.
