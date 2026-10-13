# Environments and hosts

The app follows SERP's Environment Configuration standard: configuration is set explicitly per
environment, never inferred from the host. How each environment is deployed is in
[ci-deploys.md](ci-deploys.md).

| Environment | Deployed from | `wrangler.toml` env | Worker | `SITE_ENV` | Host | D1 | Uploads (R2) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Production | `main` | `production` | `serp-checklists-production` | `production` | `serplists.com` | `serp-checklists-db` | `serp-checklists-uploads` |
| Staging | `staging` | `preview` | `serp-checklists-preview` | `staging` | `staging.serplists.com` | `serp-checklists-staging-db` | `serp-checklists-staging-uploads` |
| Local (`next dev`, `pnpm run preview`) | a checkout | top level | none | unset | none | a local D1 under `.wrangler/` | a local bucket |

A Wrangler environment inherits no bindings from the top level of `wrangler.toml`, so each one
repeats its D1, R2 and self-reference bindings, and every deploy passes `--env`.

## Hosts

- **Production** lives on `https://serplists.com`, served by the production Worker through zone
  routes (`serplists.com/*` and `www.serplists.com/*`, `[[env.production.routes]]` in
  `wrangler.toml`, so each deploy keeps them attached). `www` redirects to the apex. The domain
  moved from the Pages project on 2026-10-07 without a gap: the routes answer before the
  hostnames' proxied DNS records, which still name the Pages project.
- **Staging** lives on `https://staging.serplists.com`, served by the staging Worker through a
  zone route (`staging.serplists.com/*`, `[[env.preview.routes]]`). The hostname's proxied DNS
  record still names the retired Pages project, which the route answers before; replacing the
  record and the route with a Worker custom domain needs a token that can edit DNS.
- **Each Worker keeps its `workers.dev` address,** which CI tests a new deployment on
  ([ci-deploys.md](ci-deploys.md#smoke-tests)). Staging's is
  `https://serp-checklists-preview.serpcompany.workers.dev`. Both environments set
  `workers_dev = true`: wrangler turns the address off for an environment that has routes unless
  it is set, and the deploy then prints no address for its checks and fails. A request to either
  address redirects (308) to the environment's host, unless it carries the smoke-test header
  (`x-serplists-smoke-test`), which the deploy's checks send. The header is not a secret: it only
  reveals the same site on another host, and search engines never send it.
- **No version preview URLs.** Both environments set `preview_urls = false`, so no version's
  preview URL serves a copy of the site; `workers_dev = true` keeps the address CI tests through
  (`tests/unit/wrangler/environment-isolation.test.ts`).
- **Staging is open to the public.** It has no Basic-auth gate, and anyone may sign up there, with
  email verification off (`AUTH_EMAIL_VERIFICATION_REQUIRED`). It relies on `noindex` to stay out
  of search; closing it is recorded as debt for the owner's decision.

## Configuration

- **Indexing and analytics.** Only a site marked `SITE_ENV=production` may be indexed or load
  analytics ([frontend.md](frontend.md#production-and-other-environments)). Any other value, or
  none, sends `X-Robots-Tag: noindex, nofollow` with every page, API response and static file,
  answers `/robots.txt` with `Disallow: /`, and loads no Tag Manager. Canonical URLs name
  `https://serplists.com` on every environment.
- **Set it in both places.** `SITE_ENV` shapes the build (static pages, the `next.config.ts`
  headers and redirects, the `_headers` file the build writes) and what renders on request (the
  Worker's `vars`).
  Each environment's vars in `wrangler.toml` set it, and each environment's build must set the
  same value (`SITE_ENV=production pnpm run build:worker`). A build without it is
  non-production, which is the safe default; `scripts/check-env.ts` rejects a value other than
  `production` or `staging`, so a misspelled `production` cannot quietly hide the site from
  search engines.
- **One host per environment.** `next.config.ts` sends every other host that reaches the Worker
  to the environment's host with a 308, in one hop and in the canonical URL form:
  `www.serplists.com` to `serplists.com`, and each Worker's `*.workers.dev` URL (and its version
  preview URLs) to its environment's host, which `deploymentOrigin()` in
  `src/lib/seo/siteOrigin.ts` names: `https://serplists.com` for production and
  `https://staging.serplists.com` otherwise. API paths keep their exact path. When adding a host,
  add its redirect in `next.config.ts` and a case in `tests/unit/config/urlStandard.test.ts`.
- **Allowed origins.** `CORS_ALLOWED_ORIGINS` in each environment's vars lists the origins the API
  answers cross-origin: Staging's host and its `workers.dev` address, and Production's host.
- **The release.** Each build gets `NEXT_PUBLIC_RELEASE_COMMIT` from CI, the commit it was built
  from, which `/api/health` and every page report with the environment
  ([observability.md](observability.md)).
- **Secrets.** Each Worker has its own, set with
  `wrangler secret put <NAME> --env <preview|production>`
  ([security.md](security.md#secrets-and-environment)). Stripe and the auth email aren't set up on
  Staging, so billing and password emails show as unavailable there.

## Checking a running site

`node --import tsx scripts/check-site-standards.ts <base-url> <staging|production>` checks the URL
standard (canonical URLs answer 200, the other form 308 in one hop, the API is never redirected,
the sitemaps list only canonical URLs), that `/api/health` and `/api/templates` answer 200, the
environment's `robots.txt`, `X-Robots-Tag` and Tag Manager, and the host redirects. Against a deployed `workers.dev` URL it sends the smoke-test
header, and checks that a request without it is redirected to the environment's host.

Locally, build with the environment's `SITE_ENV`, serve the build with
`opennextjs-cloudflare preview --env <production|preview> --persist-to <dir>` (after
`wrangler d1 migrations apply DB --local --env <env> --persist-to <dir>`: an environment's local
D1 is a separate database), and pass `--local`, which sends the other hosts as a `Host` header.
Don't test host rules with an environment that has custom-domain `routes`: Wrangler then rewrites
the `Host` header.
