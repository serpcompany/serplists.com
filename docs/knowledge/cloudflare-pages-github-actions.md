# Cloudflare Pages deploys from GitHub Actions

This repo deploys to Cloudflare Pages via `wrangler pages deploy` in GitHub Actions on pushes to `main` and `staging`.

## Required GitHub secrets
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_EMAIL`
- `CLOUDFLARE_API_KEY`

The Cloudflare Pages project name is `serplists-com`. It is not a secret and is set directly in the workflow. Do not set it to `serp-checklists`; that is the pages.dev domain/project config name, not the Pages Project Name Cloudflare expects for `wrangler pages deploy --project-name`.

## Why the workflow uses email + global key
- The legacy `CLOUDFLARE_API_TOKEN` available to this repo verified as active, but Cloudflare returned an authentication error when the workflow tried to read the `serp-checklists` Pages project on the `SERP` account.
- The same project was readable and deployable with `CLOUDFLARE_EMAIL` + `CLOUDFLARE_API_KEY`, so the workflow now uses Wrangler directly with that auth path.

## Notes
- The workflow runs `pnpm run verify:prod:d1` before build/deploy on `main`.
- The workflow runs `pnpm run verify:staging` before build/deploy on non-main branches.
- Production checks read production D1. Preview checks read the D1 preview binding configured by `preview_database_id` in `wrangler.toml`.
- These checks are read-only gates. If required migrations, tables, or columns are missing, the workflow fails before Pages deploy.
- The workflow builds with `pnpm run build` and deploys `dist` with `npx wrangler pages deploy --project-name serplists-com`.
- The workflow also runs `pnpm run typecheck:env` before build. Because the real auth secret lives in Cloudflare Pages runtime settings, the workflow injects a build-only placeholder `BETTER_AUTH_SECRET` so env validation can pass in GitHub Actions without copying the production secret into GitHub.
- Keep `actions/checkout` and `actions/setup-node` on `v5` or newer so the workflow does not fall back to the deprecated Node 20 action runtime.
- Update `node-version` in `.github/workflows/cloudflare-pages-deploy.yml` if a different Node version is required.
- Ensure `.github` is not gitignored; the workflow file must be committed to `main` for Actions to run.

## Database routing

- `main` deploys must use production D1: `serp-checklists-db`.
- `staging` and preview deploys must use staging D1 through Wrangler's preview binding and the explicit Pages preview env binding: `serp-checklists-staging-db`.
- The workflow intentionally calls `pnpm run verify:staging` for non-main branches so preview deploys fail if the preview binding is missing or points to production.
- Do not remove the preview D1 check when adding new branches; production data must not be used for preview deploys.
