---
name: browser-tests
description: Run and debug the SERP Lists Playwright browser tests. Picks the smallest run (one spec file or one test on the isolated local stack, reusing a production build, at low priority), reads a failure from its error-context.md, trace, video, and the server log, and follows the repository's spec conventions (canonical URLs, sign-in and API helpers, seeded data). Use when adding or changing a spec in tests/e2e/, when a page or route change needs its specs run, and when a browser test fails locally or in CI.
---

# Run and debug the browser tests

The browser tests run the production build on an isolated local stack: `tests/e2e/run-smoke.ts`
builds the app with OpenNext and `SITE_ENV=production`, wipes, migrates, and seeds its own D1 in
`.wrangler/smoke-state`, and serves the build in workerd on this checkout's `e2e` port, or the
next free one (`pnpm run ports`). One workerd process renders every page, so the tests run on one
Playwright worker. Run one stack at a time on this machine, and never two test runs at once: look
for one already running before starting another.

## 1. Pick the smallest run

```bash
pnpm run test:e2e:full tests/e2e/<name>.spec.ts                      # one spec file, every test in it
pnpm run test:e2e:full tests/e2e/<name>.spec.ts -g "<test title>"    # one test
pnpm run test:e2e:full --skip-build tests/e2e/<name>.spec.ts         # reuse the last build
pnpm run test:smoke                                                  # the @smoke tests, a quick look at the main paths
pnpm run test:e2e:full                                               # every spec, as CI runs them on every pull request
```

Run them in the background, through
`node --import tsx scripts/run-at-low-priority.ts pnpm run test:e2e:full <specs>`, which caps the
build and the browsers to a quarter of the CPU threads, so the machine stays usable. While working,
run the specs the change touches; CI runs the whole suite.

Leave out the `--` that pnpm scripts usually take: pnpm passes it on, and Playwright then reads
every option after it as a file filter. `--skip-build` reuses the build in `.open-next/`, which
must be a production build: the one the last test run made, or
`SITE_ENV=production pnpm run build:worker`. The runner refuses any other. Rebuild after changing
app code, because the tests load the build, not the source.

## 2. Read a failure

1. `error-context.md` in the test's folder, under `test-results` in `tests/`: the page snapshot
   at the moment the test failed. It is often enough by itself.
2. The trace, video, and screenshot beside it. `pnpm exec playwright show-trace <path>/trace.zip`
   opens the trace for a person.
3. The server side: wrangler writes a debug log for each run, with the API's `api_request`
   lines, to `.wrangler/logs` in your home folder (`%APPDATA%\xdg.config\.wrangler\logs` on
   Windows). Compare its times with the trace; the `debug-api` skill reads those lines.
4. To watch it happen, go through the same steps on `pnpm run preview` with the `verify-web`
   skill.

The `Browser tests` workflow runs every spec on every pull request and in the merge queue
(`docs/agents/ci.md`, Browser tests). When a run fails, it uploads that `test-results` folder as the
`playwright-evidence` artifact: `gh run download <run-id> -n playwright-evidence` fetches it, and
`gh run view <run-id> --log-failed` shows the failing step's log.

## 3. Write specs the repository's way

`docs/agents/testing.md` has the full list. The rules specs most
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
- A behavior in `docs/product/` that a spec proves names it in its `- Check:` line, by the spec's
  abbreviation and the test's title, so renaming a test means updating that line in the same pull
  request (`pnpm run verify docs` fails a title no test has).

The unit tests in `tests/unit/e2e/` enforce several of these. Read a failure's message before
changing the spec: it says what to do instead.

## 4. A regression test for a bug

Write the spec that shows the bug first and watch it fail, then fix the code and watch it pass.
Put it in the spec for the page it's on, named for the behavior the user should see, not the bug.
A spec that only flakes is a failing spec: wait for the state the user sees, never a fixed time.
