# Deploys

How a change is shipped to Staging and Production, and the principles every deploy keeps.


## Principles

- Every check runs in CI, and nothing deploys unless every check passes.
- Deploys fail closed: pending D1 migrations or a failed probe of the new
  deployment stop the release.
- Preview deployments never touch production data.
- Schema changes go through Wrangler migrations only, never ad hoc remote SQL.
- If an incident starts right after a deploy, roll back first and debug second.

## Deploy pipeline

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` and `staging`;
`.github/workflows/browser-tests.yml` builds and runs the browser tests on pull requests only
(`tests/unit/workflows/browser-tests.test.ts`). A push
to `staging` that passes the Quality Gate and the schema parity check deploys staging, through
`.github/workflows/deploy-staging.yml`, and a push to `main` that passes them deploys the
production Worker, through `.github/workflows/deploy-production.yml`
(`tests/unit/workflows/deploy-workers.test.ts` checks both).

Production lives on `https://serplists.com`, served by the production Worker through zone
routes (`serplists.com/*` and `www.serplists.com/*`, `[[env.production.routes]]` in
`wrangler.toml`, so each production deploy keeps them attached); `www` redirects to the apex.
The domain moved from the Pages project on 2026-10-07: the routes went in first, which answer
before the hostnames' proxied DNS records (they still name the Pages project), and the domain
left Pages after the production site standards passed on it, so it never stopped serving. The
deploy blocks while production D1 has pending migrations (`verify:prod:d1`), and the Worker
needs its secrets ([SECURITY.md](security.md#secrets-and-environment)). The deploy's site
check runs up to three times, 20 seconds apart, because a brand-new Worker answered 404 for
its pages in its first seconds (`checkSiteStandardsUntilItPasses`). Staging lives on
`https://staging.serplists.com`, served by its Worker through a zone route
(`staging.serplists.com/*`, `[[env.preview.routes]]` in `wrangler.toml`, so each deploy keeps
it attached). The hostname's proxied DNS record still names the retired Pages project, which
the route answers before; replacing the record and the route with a Worker custom domain needs
a token that can edit DNS. The Worker's `workers.dev` address,
`https://serp-checklists-preview.serpcompany.workers.dev`, redirects there (308), except for a
request carrying the smoke-test header (`x-serplists-smoke-test`), which the deploy's checks
(`scripts/verify-deployment.ts`, `scripts/check-site-standards.ts`) send so they test the new
deployment before the domain serves it. Both environments set `workers_dev = true`: wrangler turns the
`workers.dev` address off for an environment that has routes unless it is set, and the deploy
then prints no address for those checks and fails.

The staging deploy:

1. validates the env contract with a placeholder `BETTER_AUTH_SECRET`. The real secret is a
   Worker secret: `wrangler secret put BETTER_AUTH_SECRET --env preview`.
2. blocks on pending migrations in staging's D1: `pnpm run verify:staging`.
3. builds the Worker with `SITE_ENV=staging` and `NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED=true`, from
   full git history (`fetch-depth: 0`), because sitemap `lastmod`
   values come from `git log`; a shallow clone would stamp every page with the
   deploy date, so `sitemap:generate` fails on one in CI. Each bundled Template is
   dated by the newest commit on the built branch (first-parent) that changed its
   content, read from the pack history (`scripts/lib/sitemapLastmod.ts`). The
   committed `functions/sitemap/bundled-catalog.generated.json` is never trusted
   for those dates, so a copy generated before an edit was committed cannot keep an
   old date. Content that is not committed yet gets the local build time, kept while it
   stays the same; the previous catalog is read only for that, and for a static page
   git has no date for.
4. runs `opennextjs-cloudflare deploy --env preview`, which uploads the `serp-checklists-preview`
   Worker. The step fails when the output names no `workers.dev` URL, so a deployment is never
   left unchecked.
5. probes the new deployment's `/api/health` (the Worker boots) and `/api/templates` (D1 is
   bound) with `scripts/verify-deployment.ts`.
   - It tries up to six times, 10 seconds apart, since a new hostname can take a few seconds
     to resolve.
   - A 5xx or no response (DNS, connect, TLS, or a 30-second timeout) fails the run. Other
     statuses, such as an access policy, only warn.
   - The probe follows no redirect, so an access login counts as its redirect status.
6. checks the deployment against the site standards with `scripts/check-site-standards.ts`.

Settings:

- **Address:** staging answers on its `workers.dev` address, which `STAGING_ORIGIN`
  (`src/lib/seo/siteOrigin.ts`), `scripts/check-site-standards.ts` and staging's
  `CORS_ALLOWED_ORIGINS` in `wrangler.toml` all name.
- **Database:** the `preview` environment binds `serp-checklists-staging-db`.
- **Secrets:** the Worker has `BETTER_AUTH_SECRET`. Stripe and auth email secrets are not set,
  so billing and password emails show as unavailable on staging (see [SECURITY.md](security.md)).
- **GitHub secrets:** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL` and `CLOUDFLARE_API_KEY`, the
  account email and global key.
- **Indexing:** which environment may be indexed is set by `SITE_ENV` and `next.config.ts`, not
  by the host a request names (see [environments and hosts](environments.md#environments-and-hosts)).
- **Actions versions:** keep `actions/checkout` and `actions/setup-node` on v5 or newer. Node is
  pinned to 22.
- **Local API URL:** `pnpm run build` refuses a localhost `NEXT_PUBLIC_API_URL` (unless
  `ALLOW_LOCAL_API_URL=1`), so a local API URL cannot ship.
