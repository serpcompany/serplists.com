# Cloudflare Pages deploys from GitHub Actions

This repo deploys to Cloudflare Pages via `cloudflare/pages-action@v1` on pushes to `main`.

## Required GitHub secrets
- `CLOUDFLARE_API_TOKEN` (Cloudflare Pages - Edit permission)
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT` (Pages project name)

## Token setup (Cloudflare dashboard)
1. Profile menu -> My Profile -> API Tokens -> Create Token.
2. Create a Custom Token with **Account / Cloudflare Pages / Edit** permission.
3. Save the token and add it to GitHub secrets as `CLOUDFLARE_API_TOKEN`.

## Notes
- The workflow builds with `pnpm run build` and uploads the `dist` directory.
- Update `node-version` in `.github/workflows/cloudflare-pages-deploy.yml` if a different Node version is required.
<<<<<<< HEAD
=======
- Ensure `.github` is not gitignored; the workflow file must be committed to `main` for Actions to run.
>>>>>>> 7fa6643 (asdf)
