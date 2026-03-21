# Cloudflare Pages deploys from GitHub Actions

This repo deploys to Cloudflare Pages via `wrangler pages deploy` in GitHub Actions on pushes to `main`.

## Required GitHub secrets
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT` (Pages project name)
- `CLOUDFLARE_EMAIL`
- `CLOUDFLARE_API_KEY`

## Why the workflow uses email + global key
- The legacy `CLOUDFLARE_API_TOKEN` available to this repo verified as active, but Cloudflare returned an authentication error when the workflow tried to read the `serp-checklists` Pages project on the `SERP` account.
- The same project was readable and deployable with `CLOUDFLARE_EMAIL` + `CLOUDFLARE_API_KEY`, so the workflow now uses Wrangler directly with that auth path.

## Notes
- The workflow now runs `pnpm run check:prod:d1-schema` before build/deploy.
- That schema check is a read-only gate against production D1. If required tables or columns are missing, the workflow fails before Pages deploy.
- The workflow builds with `pnpm run build` and deploys `dist` with `npx wrangler pages deploy`.
- The workflow also runs `pnpm run typecheck:env` before build. Because the real auth secret lives in Cloudflare Pages runtime settings, the workflow injects a build-only placeholder `BETTER_AUTH_SECRET` so env validation can pass in GitHub Actions without copying the production secret into GitHub.
- Update `node-version` in `.github/workflows/cloudflare-pages-deploy.yml` if a different Node version is required.
- Ensure `.github` is not gitignored; the workflow file must be committed to `main` for Actions to run.
