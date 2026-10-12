# Environments and hosts

The app follows the SERP environment configuration standard: configuration is set
explicitly per environment, never inferred from the host.

| Environment | `wrangler.toml` env | `SITE_ENV` | Canonical host |
| --- | --- | --- | --- |
| Production | `production` | `production` | `serplists.com` |
| Staging | `preview` | `staging` | `staging.serplists.com` |
| Local (`next dev`, `pnpm preview`) | top level | unset | none |

A Wrangler environment inherits no bindings from the top level of `wrangler.toml`, so each
one repeats its D1, R2 and self-reference bindings.

- **Indexing and analytics.** Only a site marked `SITE_ENV=production` may be indexed or
  load analytics ([FRONTEND.md](frontend.md#production-and-other-environments)). Any other
  value, or none, sends `X-Robots-Tag: noindex, nofollow` with every page, API response
  and static file, answers `/robots.txt` with `Disallow: /`, and loads no Tag Manager.
  Canonical URLs name `https://serplists.com` on every environment.
- **Set it in both places.** `SITE_ENV` shapes the build (static pages, the `next.config.ts`
  headers and redirects, `public/_headers`) and what renders on request (the Worker's
  `vars`). Each environment's vars in `wrangler.toml` set it, and each environment's build
  command must set the same value (`SITE_ENV=production pnpm run build:worker`). A build
  without it is non-production, which is the safe default; `scripts/check-env.ts` rejects a
  value other than `production` or `staging`, so a misspelled `production` cannot quietly
  hide the site from search engines.
- **One host per environment.** `next.config.ts` sends every other host that reaches the
  Worker to the environment's host with a 308, in one hop and in the canonical URL form:
  `www.serplists.com` to `serplists.com`, and the production Worker's `*.workers.dev` URL (and
  its version preview URLs) to `serplists.com`. API paths keep their exact path. Staging has no
  domain of its own yet, so its build skips the workers.dev redirect (`isOnWorkersDev`) and
  serves on its `workers.dev` address. A request with the `x-serplists-smoke-test` header
  skips the workers.dev redirect, so CI can test a production deployment on its workers.dev
  URL; the header is not a secret.
  When adding a host (another custom domain), add its redirect in `next.config.ts` and a
  case in `tests/unit/config/urlStandard.test.ts`.
- **Checking a running site.** `node --import tsx scripts/check-site-standards.ts <base-url>
  <staging|production>` checks the URL standard (canonical URLs answer 200, the other form
  308 in one hop, the API is never redirected, the sitemaps list only canonical URLs), the
  environment's robots.txt, `X-Robots-Tag` and Tag Manager, and the host redirects. Against
  a deployed workers.dev URL it sends the smoke-test header, and checks that a request
  without it is redirected. Locally, build with the environment's `SITE_ENV`, serve it with
  `opennextjs-cloudflare preview --env <production|preview> --persist-to <dir>` (after
  `wrangler d1 migrations apply DB --local --env <env> --persist-to <dir>`: an env's local D1
  is a separate database), and pass `--local`, which sends the other hosts as a `Host` header.
  Do not test host rules with an env that has custom-domain `routes`: Wrangler then rewrites
  the `Host` header.
