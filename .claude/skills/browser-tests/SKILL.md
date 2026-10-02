---
name: browser-tests
description: Run and debug the SERP Lists Playwright browser tests. Picks the smallest run (one spec file or one test on the isolated local stack, reusing a production build), reads a failure from its error-context.md, trace, video, and the server log, and follows the repository's spec conventions (canonical URLs, sign-in and API helpers, seeded data). Use when adding or changing a spec in tests/e2e/, when a browser test fails locally or in CI, or before promoting staging to main.
---

# Run and debug the browser tests

The browser tests run the production build on an isolated local stack: `tests/e2e/run-smoke.ts`
builds the app with OpenNext and `SITE_ENV=production`, wipes, migrates, and seeds its own D1 in
`.wrangler/smoke-state`, and serves the build in workerd on a free port from 4173. One workerd
process renders every page, so the tests run on one Playwright worker. Run one stack at a time
on this machine, and never two test runs at once.

## 1. Pick the smallest run

```bash
pnpm run test:e2e:full tests/e2e/<name>.spec.ts                      # one spec file, every test in it
pnpm run test:e2e:full tests/e2e/<name>.spec.ts -g "<test title>"    # one test
pnpm run test:e2e:full --skip-build tests/e2e/<name>.spec.ts         # reuse the last build
pnpm run test:smoke                                                  # the @smoke tests, as CI runs them on pull requests
pnpm run test:e2e:full                                               # every spec, required before promoting staging to main
```

Leave out the `--` that pnpm scripts usually take: pnpm passes it on, and Playwright then reads
every option after it as a file filter. `--skip-build` reuses the build in `.open-next/`, which
must be a production build: the one the last test run made, or
`SITE_ENV=production pnpm run build:worker`. The runner refuses any other. Rebuild after changing
app code, because the tests load the build, not the source.

## 2. Read a failure

1. `error-context.md` in the test's folder under `tests/test-results/`: the page snapshot at the
   moment the test failed. It is often enough by itself.
2. The trace, video, and screenshot beside it. `pnpm exec playwright show-trace <path>/trace.zip`
   opens the trace for a person.
3. The server side: wrangler writes a debug log for each run, with the API's `api_request`
   lines, to `.wrangler/logs` in your home folder (`%APPDATA%\xdg.config\.wrangler\logs` on
   Windows). Compare its times with the trace; the `debug-api` skill reads those lines.
4. To watch it happen, go through the same steps on `pnpm run preview` with the `verify-web`
   skill.

The `Browser tests` workflow (`.github/workflows/browser-tests.yml`) runs only on pull requests:
`test:smoke` on PRs into `staging` and `test:e2e:full` on promotions to `main`. When a run
fails, it uploads `tests/test-results/` as the `playwright-evidence` artifact:
`gh run download <run-id> -n playwright-evidence` fetches it, and
`gh run view <run-id> --log-failed` shows the failing step's log.

## 3. Write specs the repository's way

The Testing conventions section of `docs/RELIABILITY.md` has the full list. The rules specs most
often miss:

- Open pages at their canonical URLs (`/dashboard/templates/`, `/login/`). A URL without its
  slash only tests a redirect.
- Sign in with `fillSignInForm()` from `tests/e2e/support/sign-in.ts` (the production build has no
  quick-fill buttons), and move inside the app with `navigateInApp()` from
  `tests/e2e/support/navigation.ts`.
- Set up and read data with `apiRequest()` or `apiJson()` from
  `tests/e2e/support/api-requests.ts`, not with a fetch inside `page.evaluate()`. Each call passes
  the schema of the body it reads (the app's own, from `tests/e2e/support/api-bodies.ts`, or
  `bodyNotRead`), so a spec never trusts a guessed shape.
- Use only the data `seed-test` creates (`db/seeds/local.ts`) and the bundled Templates, or create
  what the spec needs in the spec.
- Keep `localhost`: `127.0.0.1` drops the session cookie.

The unit tests in `tests/unit/e2e/` enforce several of these. Read a failure's message before
changing the spec: it says what to do instead.
