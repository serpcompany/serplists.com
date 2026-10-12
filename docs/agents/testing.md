# Testing conventions

- Run the smallest relevant test while developing; run `pnpm run verify` before a PR.
- **Test what the code does, never its text.** ESLint refuses a test that reads code under
  `src/` or `functions/` ([repository checks](checks.md#repository-checks)). Instead:
  - a page, layout or route file: call it (`AppLayout({ children })`, a page's default export)
    and search the elements it returns (`tests/support/elementTree.ts`), or render it; the root
    layout through `tests/support/rootLayout.ts`;
  - the stylesheet: compile what the root layout imports and read the compiled rules
    (`tests/support/appStylesheet.ts`);
  - data the app ships: import it (a JSON pack, `templatePackModules`);
  - the modules a feature reaches: ask dependency-cruiser's `cruise()`, as
    `tests/unit/scripts/sitemap-implementation-sources.test.ts` does;
  - a column default or a trigger: apply the migrations with `SqliteD1` and read the row back;
  - a rule about how all code is written: a convention in
    `scripts/eslint-rules/code-conventions.ts`, with a sample in
    `tests/unit/config/code-conventions.test.ts`.
- **Look for shared setup before writing any.** A mock, fixture or browser step that a second
  test needs lives in one of three folders, and `pnpm run duplicates:check` fails on a second
  copy of 5 lines and 50 tokens:
  - `tests/fixtures/`: data and fake objects with the types the code under test receives:
    handler rows (`handlerRows.ts`), Templates and runs (`dashboardTemplate.ts`,
    `launchChecklistTemplate.ts`, `runExecutionFixtures.ts`, `runStartFixtures.ts`),
    workspaces and plans (`workspaces.ts`, `plans.ts`), Run Keys (`agentKeys.ts`), the template
    detail page's API client (`templateDetailApiClient.ts`), the template editor's hooks
    (`templateEditorHooks.ts`), storage (`memoryStorage.ts`), JSON files (`jsonFile.ts`) and
    query clients (`queryClient.ts`).
  - `tests/support/`: modules that mock what the code under test imports, imported before it
    (see the API handler tests below), and harnesses that run it:
    - API handlers: `apiHandlerMocks.ts` and the modules for each area
      (`templatesHandler.ts`, `checklistsHandler.ts`, `teamsHandler.ts`, `agentMcpHandler.ts`,
      `portableTemplatesHandler.ts`), `mockedSession.ts`, `apiEnv.ts`, `apiRouter.ts`,
      `sqlite-d1.ts` for SQL, `d1Doubles.ts` and `r2Bucket.ts` for D1 and R2 stand-ins, and
      `storedJson.ts` to read what a handler stored.
    - Reading what the code under test returns: `readJson.ts`, `mcpResponses.ts`,
      `asymmetricMatchers.ts`, `thrownError.ts`, and `eslintConfig.ts` for an ESLint config's
      rules.
    - Next.js and the server: `mockedNextNavigation.ts`, `mockedServerContext.ts`,
      `builtRoutes.ts` and `sitemapRoutes.ts`.
    - The app's contexts and hooks: `appShellInPlace.tsx` (the auth, Templates and workspace
      contexts around a page), `hookDoubles.ts`, `mockedPersonalWorkspace.ts`,
      `mockedWorkspaceRoles.ts`, `mockedTemplateLibrary.ts`, `mockedDashboardTemplatesModel.ts`, `mockedR2Uploads.ts` and
      `uploadMocks.ts`.
    - Components called without a DOM: `reactHookStubs.ts`, `reactHooksKeptBetweenRenders.ts`,
      `reactHookFormMock.ts`, `hookStateSlots.ts` and `elementTree.ts`.
    - Components in the DOM: `renderInTheDom.ts` (`renderSettled()`, the in-memory browser
      as the page's window, `typeInto()`, `inputNamed()`, `theButtonOrMenuItemNamed()` and
      `openTheMenu()`), `confirmDialogs.ts` (open a dialog, answer it and wait for it to
      close) and `queryClientsPerTest.ts`; and the
      providers, hook probes and pages ready to mount (`authProviderHarness.tsx`,
      `queryHookProbe.tsx`, `templatesProviderHarness.tsx`, `checklistRunPage.tsx`,
      `templateDetailPage.tsx`, `publicTemplatePage.tsx`, `categoryPage.tsx`,
      `teamInvitePage.ts`); a mounted page restored from the back/forward cache
      (`pageRestore.ts`) and a sign-out control that must wait for the server
      (`signOutControl.ts`).
    - The root layout and the stylesheet: `rootLayout.ts` (`rootLayoutOn(siteEnv)`,
      `plainScriptsInTheHead()`) and `appStylesheet.ts`
      (`compileTheStylesheetTheRootLayoutImports()`).
    - Scripts and workflows: `workflowGuards.ts` and `throwawayGitRepository.ts`; a server's
      port: `listeningPort.ts`; ESLint rules: `ruleTester.ts`; a garbage collection that runs
      the finalizers, for code that must survive one (a request body read after an await):
      `collectGarbageAndRunFinalizers()` in `garbageCollection.ts`.
  - `tests/e2e/support/`: browser spec steps: signing in and registering (`sign-in.ts`), the
    template editor (`template-editor.ts`), runs (`run-saves.ts`), billing stubs
    (`billing.ts`), API calls (`api-requests.ts`) and the schemas of what they read
    (`api-bodies.ts`), a mocked API (`mocked-api.ts`) and navigation (`navigation.ts`).
- **Tests that make their own git repositories.** The unit test setup (`tests/setup.ts`)
  clears git's repository variables (`GIT_DIR` and the like) before any test runs.
  - Inside a git hook git sets them: the pre-push hook runs `pnpm run verify`, and in a linked
    worktree `GIT_DIR` names that worktree's repository.
  - Without the clearing, a test that runs `git init`, `add` or `commit` in its fixture would
    write into the real repository instead.
  - Scripts that run git in a directory they are given use `withoutGitRepositoryOverrides()`
    from `scripts/lib/git-env.ts`.
- Every test runs. ESLint refuses `.skip`, `.todo`, `skipIf`, `runIf`, `fixme`, `xit` and a
  `.only` call in Vitest and Playwright files, and a test file excluded from `test:run` must
  be in `test:local-d1` (`tests/unit/config/no-exceptions.test.ts`). A test that cannot pass
  yet is fixed or deleted, never skipped.
- Tests are type-checked like the app; Vitest and Playwright strip types without checking
  them. `tests/tsconfig.json` extends the app's `tsconfig.json`, includes every TypeScript
  file under `tests/` (unit and integration tests, browser specs, support and fixtures) with
  `next-env.d.ts`, `cloudflare-env.d.ts`, `src/js-yaml.d.ts` and `src/next-public-env.d.ts`, and
  runs in `pnpm run typecheck`. It holds the tests to `strict` and the five settings the app's
  config adds, which it inherits ([quality gates](checks.md#quality-gates)).
  `tests/unit/config/typecheck-coverage.test.ts` fails when `pnpm run typecheck` runs no
  tsconfig that includes a TypeScript file the repository holds, skips a tsconfig, or runs one
  that turns off any of the five settings. A
  `.tsx` file next to a `.ts` file of the same name is in no include: TypeScript keeps only
  the `.ts` one, so the test names it.
- Read a response body with `readJson(response, schema)` from `tests/support/readJson.ts`,
  which parses it with Zod and returns the schema's output type (`ResponseSchema`, as the
  app's `apiRequest` takes), so the test checks the shape it reads instead of trusting a cast.
  A schema names the fields the test reads and ends each object in `.passthrough()`: a plain
  `z.object()` drops the fields it does not list, and a `toEqual()` on the result would then
  pass for a body with more. The file also holds
  `jsonObject`, `jsonObjects`, the API's error body (`apiErrorBody`, from `jsonError()` and
  `authJsonError()`) and Better Auth's (`betterAuthErrorBody`). A test that only compares the
  whole body may pass `await response.json()` straight to `expect()`.
  - The MCP endpoint's JSON-RPC bodies, tool results and paged lists have schemas in
    `tests/support/mcpResponses.ts`; `toolBody()` and `rpcErrorBody()`
    (`tests/support/agentMcpHandler.ts`) and `callToolWithAFreshRunKey()`
    (`tests/support/agentMcpOnSqlite.ts`) read with them. A field of a JSON record is read with
    `recordIn`, `recordsIn`, `optionalRecordIn`, `textIn` or `numberIn` from the same file,
    never with `as JsonRecord`. These parse a copy, so a test that changes an object in place
    keeps its own reference to it.
  - What a handler stored (a D1 row's `items`, `retired_items` or audit JSON, a log line) is
    parsed with `tests/support/storedJson.ts`: `storedSectionsIn(column)` for checklist
    sections (parsed into the `SectionRecord`, `TaskRecord`, `ContentRecord` and `SubTaskRecord`
    shapes), `jsonRecordIn` and `jsonRecordsIn` for other JSON, `logLineIn` for an API log line
    (`LogLine` names the logger's own fields), and `parseJsonText(text, schema)` for any other
    shape. The Drizzle chain mocks (`tests/support/drizzleChainMocks.ts`) record each `set()`
    and `values()` row as a `StoredRow` (`tests/support/d1Doubles.ts`), which names every column
    of every Drizzle table as `unknown`, so a test reads a stored column through these instead
    of trusting `any`. `SqliteD1.rows()` returns `StoredRow`s too, and a row read straight from
    `node:sqlite` is typed as one.
  - An MCP result's fields are typed by `McpRecord` in `tests/support/mcpResponses.ts`, which
    `recordIn` and the paged-read helpers (`tests/support/templatePages.ts`,
    `tests/support/runPages.ts`) return.
  - Browser specs run in Playwright, which cannot load Vitest, so they import only modules
    that do not import Vitest. The request helpers in `tests/e2e/support/api-requests.ts`
    take a schema, as `readJson()` does: `apiRequest(page, path, schema, init)`,
    `apiJson(page, path, schema, init)` and `apiJsonAt(page, path, method, schema, body)`
    parse the body with it, and `apiRecord()` parses a JSON record. Each call passes the
    app's schema for the body it reads (`createdRunSchema`, `savedTemplateSchema`,
    `apiRunSchema`, `runShareCreatedSchema` and others, re-exported from
    `tests/e2e/support/api-bodies.ts`, whose modules import only Zod), a schema of its own, or
    `bodyNotRead` when it reads only the status. `sectionsOfStoredItems(run.items)` in the same
    file parses a run's stored sections. A mocked API reply that the app parses is built
    through the schema the client reads it with (`updatedTeamSchema.parse({...})` in
    `team-settings-conflicts.spec.ts`). The client refuses a reply it cannot read, so a mock
    that drifts from what the API sends fails when it is built, with Zod's message, not as a
    missing toast.
  - An asymmetric matcher inside an expected object comes from
    `tests/support/asymmetricMatchers.ts` (`objectContaining`, `stringMatching`,
    `anyInstanceOf` and the rest), typed `unknown`: Vitest types `expect.objectContaining()`
    and its kin as `any`, which `no-unsafe-assignment` refuses as an object property. An error
    a test matches by its fields is read with `errorThrownBy(action)` from
    `tests/support/thrownError.ts`.
- Fixtures and mocks have the types of what the code under test receives, with no casts:
  - `apiEnv(vars)` (`tests/support/apiEnv.ts`) is a complete `Env`. Its `DB` and
    `R2_UPLOADS` throw, naming the binding, when the code under test uses them; pass the one
    it needs (a `SqliteD1` binding, an `InMemoryR2Bucket` from `tests/support/r2Bucket.ts`) in
    `vars`. A var a test leaves out is left out with `withoutVars(env, names)`, not set to
    `undefined`; a D1 that fails is a `D1DatabaseThatThrows`. The local D1 harnesses
    (`tests/integration/local-d1-handler-env.ts`, `tests/support/personalRunMcpLocalD1.ts`)
    hand handlers an `Env` built the same way.
  - A test double of a platform type implements it. `SqliteD1` implements `D1Database`, its
    statements extend `D1StatementDouble` from `tests/support/d1Doubles.ts`, and a D1 fake with
    canned answers extends `D1StatementDouble` and `D1DatabaseDouble` from the same file;
    `InMemoryR2Bucket` implements `R2Bucket`. Drizzle that only builds SQL runs on
    `d1ThatRunsNoQuery()` (`tests/support/apiEnv.ts`), and `apiEnvOn(database)` is the `Env` of a
    test on a `SqliteD1`. D1's `all<T>()`, `first<T>()` and `raw<T>()` and
    R2's `json<T>()` promise a row type nothing checks, in the platform as in the doubles, so
    the doubles declare those generic signatures as overloads over an implementation that
    returns what it read. A `Request` that must hand over a form as is subclasses `Request`.
  - A DOM query returns an `HTMLElement`. Narrow it as app code does, with `instanceof`
    (`HTMLInputElement`, `HTMLButtonElement`), or find a field through `inputNamed(label)`
    (`tests/support/renderInTheDom.ts`), which returns the `HTMLInputElement` its label
    names; read an input's `value` and `type` from it.
  - An element's props are typed by `ElementProps` (`tests/support/elementTree.ts`), and a
    handler on them is called through `handlerOf(element, name)`, or `handlerIn(props, name)`
    for a props object or a hook's result, which parse it as a function with Zod. A drizzle
    expression a mock recorded narrows with `sqlExpression()` (`tests/support/drizzleSql.ts`),
    and a server's port is read with `listeningPort()` (`tests/support/listeningPort.ts`).
  - A hook mocked with `vi.mock` gets a typed mock: `vi.fn<HookDouble<typeof useHook>>()`
    (`tests/support/hookDoubles.ts`) returns a `Partial` of the hook's result, so each field a
    test sets is checked against the hook while the rest stay out.
  - A fixture sets every field its type requires, even one the code under test ignores. A
    mock gets the parameters it is called with (`vi.fn((options: BetterAuthOptions) => ...)`),
    so `mock.calls` is typed, and a stand-in for a client has every method of the client's
    type (`runExecutionApiClient()` in `tests/fixtures/runExecutionFixtures.ts`).
  - Narrow a value with Vitest's `assert.exists()`, which fails the test and narrows the
    type, never with `!`, which ESLint refuses. `findElementOf(tree, Component)`
    (`tests/support/elementTree.ts`) finds a component's element with its props typed.
  - Read an element, record value or regular expression group that may be missing through
    `tests/support/elements.ts`: `firstOf`, `lastOf`, `elementAt`, `onlyElement`, `valueAt`,
    `capturedGroup` and `present` (a value in an expression), and for checklists `sectionAt`,
    `taskAt`, `taskIn`, `contentAt` and `subTaskAt`. Each returns the value typed as present or
    throws a `MissingElementError` that says what was missing, so a test that indexes into a
    result fails by name instead of with a `TypeError`. The module imports nothing, so browser
    specs use it too; code inside `page.evaluate()`, which runs in the page, throws an `Error`
    itself.
  - A request init, a prop or a fixture field with no value is left out
    (`...(body === undefined ? {} : { body })`), not set to `undefined`, as the app's code does.
  - Scripts are TypeScript, so a test imports a script's own module and gets its types: no
    declaration file sits beside a script, and `tests/tsconfig.json` turns `allowJs` off, so a
    test that imports JavaScript fails `pnpm run typecheck`. A test starts a script with
    `buildScriptInvocation()` or `execScript()` from `scripts/lib/run-tool.ts`, which run it
    with tsx's loader from any folder. tsx reads the `@/` alias from the `tsconfig.json` it
    finds above the working folder, so a test that runs a script from a folder outside the
    checkout and needs the alias sets `TSX_TSCONFIG_PATH` (`tests/unit/scripts/line-endings.test.ts`).
  - A test of what a JavaScript caller may pass but the declared types rule out is a
    `.test.mjs` file: workerd, whose local R2
    reports a range with its unused fields set to `undefined`
    (`tests/unit/functions/api/r2-file-response-from-workerd.test.mjs`). A test of content
    stored before the API checked every write is TypeScript: it passes the stored JSON as
    `unknown` through the parser the app reads it with (`normalizeSections`, `apiTemplateSchema`
    and the Template mapper) and checks what the code downstream does with the result
    (`tests/unit/components/ContentRenderer-stored-content.test.tsx`,
    `tests/unit/lib/forms/templateEditorForm.storedContent.test.ts`).
  - In the tests' program `NodeJS.ProcessEnv` requires the Worker vars
    `cloudflare-env.d.ts` declares, so an environment for a child process starts from a
    complete one (`tests/unit/scripts/check-env.test.ts`) or from `process.env`.
- Smoke and e2e suites run against the production build on a local worker, or dedicated
  staging, never production. `tests/e2e/run-smoke.ts` builds the app with OpenNext
  (skip with `--skip-build`), and Playwright's web server
  (`tests/e2e/preview-server.ts`) serves it with `opennextjs-cloudflare preview`
  (workerd) on one origin for the pages and the API: `localhost:4173`, or the next free
  port, with D1 state in `.wrangler/smoke-state`. Keep the `localhost` host name;
  mixing `127.0.0.1` drops `SameSite=Lax` cookies. The runner seeds the same directory
  the preview runs on (`PLAYWRIGHT_WRANGLER_PERSIST_TO`) whatever port or URL you preset,
  and a preset `PLAYWRIGHT_WRANGLER_PERSIST_TO` must be a folder inside `.wrangler/`
  other than `.wrangler/state`. It stops if `PLAYWRIGHT_API_URL` is not on the app's
  origin, and seeds nothing for a remote app or with `PLAYWRIGHT_REUSE_EXISTING_SERVER=1`.
- The production build has no dev helpers, so the specs bring their own:
  - Sign in with `loginAsAdmin()` or `loginAs()` from `tests/e2e/support/sign-in.ts`. They
    fill the login form with a seeded user (`fillSignInForm()`, as the Fill buttons do in
    `next dev`), wait for My Templates, where signing in lands, and let its requests finish,
    so the spec's next API call is the only one in flight. They wait for its heading, not
    the Switch context button, which sits in the closed sidebar sheet below `md`, so they
    sign in at any width.
  - Move inside the app without a reload with `navigateInApp()` from
    `tests/e2e/support/navigation.ts`. It calls Next.js's router, which Next.js exposes as
    `window.next.router` for debugging (a synthetic `pushState` only changes the URL), and
    resolves once the new page is on screen, when Next.js changes the address: a second
    navigation sent before that replaces the first, and the page it left never unmounts.
- A spec about what the app keeps in memory between pages (the query cache across a
  sign-out and the next sign-in, the session read right after signing in, a page title
  after a client-side navigation) gets there through the app: `navigateInApp()`, a link or
  a button. `page.goto()` and `page.reload()` start the app afresh, with a new QueryClient
  and a new session read, which hides the bug. Arriving through the app also keeps browser
  Back inside it.
- The browser tests run the production configuration (`E2E_SITE_ENV` in
  `tests/e2e/run-smoke-lib.ts`): the runner builds with `SITE_ENV=production`, the preview
  gets the same var, and CI's Build step sets it too. Pages are then indexable and load Tag
  Manager, as on `serplists.com`. The runner refuses a build it reuses (`--skip-build`) that
  was made for another environment, since the preview's var alone cannot change what the
  build baked in. Staging's noindex is covered by the unit tests and
  `scripts/check-site-standards.ts`. `tests/e2e/site-standards.spec.ts` checks the URL
  standard, the production rules and the host redirects (Playwright sends the other hosts
  as a `Host` header).
- A spec that checks a page's own robots rule loads the page as `https://serplists.com`
  with `serveLocalAppAsProduction` in `tests/e2e/route-structure.spec.ts`: Playwright
  answers that origin from the local preview (the built app, its pages and API) and aborts
  every other request, so nothing reaches production or analytics. A page can carry two
  robots tags, its server metadata's and the one it adds in the browser (`NoIndexMeta`), so
  `expectRobots` there checks every one.
- Specs open pages at their canonical URLs (`/dashboard/templates/`, `/login/`); a URL
  without its slash only tests a redirect.
- Browser tests run on one Playwright worker (`playwright.config.ts`): e2e specs share
  one database (TD-11), and one workerd process renders every page and every link
  prefetch, so parallel browsers only queue up behind each other there.
- That database holds only what `seed-test` creates (`db/seeds/local.ts`), plus the
  Templates bundled in `src/data`. A spec that opens `/profile/<user>/<slug>` uses one
  of those or creates its own Template. A literal Template path in `tests/e2e` must name one
  in `E2E_TEMPLATE_PAGES` (and an `/api/templates/slug/<slug>` one in
  `E2E_TEMPLATE_API_SLUGS`, which the API answers only for seeded Templates) in
  `scripts/eslint-rules/code-conventions.ts`, or ESLint refuses it;
  `tests/unit/e2e/seeded-template-paths.test.ts` checks that seed-test or the bundle has
  every one. A path that must be missing names its user or Template with the `no-such-`
  prefix (`/profile/serp/no-such-template/`), which the rule skips and no seeded or bundled
  name may start with.
- The local app runs on workerd (wrangler's dev server, under the preview), which closes a keep-alive
  connection that has been idle for 5 seconds; a request sent on it at that moment is
  lost. Playwright's request client (`page.request`, the `request` fixture,
  `route.fetch`) keeps idle connections with no limit of its own, so its request
  failed with `socket hang up`. Playwright has no option to stop that, so `playwright.config.ts`,
  which the runner and every worker load, calls `disableRequestKeepAlive()` from
  `tests/e2e/support/request-connections.ts`: it turns keep-alive off on the HTTP agent
  Playwright's request client sends every `http://` request through, so each request gets a
  new connection, which the server reads before any idle timer applies.
  `tests/unit/e2e/request-connections.test.ts` fails if a Playwright upgrade moves that
  agent or stops using it.
- Wrangler's dev proxy (its ProxyWorker) keeps its connections to the worker open the same
  way, and there the risk is not one moment: while the worker is busy (a page render, the API
  calls a page sends at once), its workerd reads no new request and runs no timer, so a
  request that reaches an idle connection in that time can lose to the connection's 5-second
  timer once the worker catches up, even one that arrived a second before it was due. The
  proxy then answers `500` and logs `Network connection lost`; it resends a GET or HEAD itself,
  not a POST, PUT or DELETE (cloudflare/workers-sdk#14641). The invite created right after an
  Organization in `team-invite-flow.spec.ts` was lost this way whenever the machine was busy.
  `patches/wrangler@4.143.0.patch`, which pnpm applies on install (`pnpm.patchedDependencies`
  in `package.json`), puts a relay between the proxy and the worker, in wrangler's own process
  (`wrangler-dist/serplists-user-worker-relay.js`): it sends every request to the worker over a
  new connection, which that timer never applies to, and never closes an idle connection from
  the proxy itself, so nothing is lost and nothing is sent twice. Wrangler's
  `ProxyController` (`wrangler-dist/cli.js`) points the proxy at the relay with each `play`
  message and closes it on teardown, and when a reload moves the worker, the old relay
  finishes the requests it holds and stops. The relay sets no time limits of its own (the
  proxy and workerd keep theirs), tunnels WebSocket upgrades to the worker over a new
  connection, and leaves remote mode (https to a preview host) as it was. When the worker
  cannot take a request, the relay drops the proxy's connection, as a lost connection to the
  worker would, so the proxy's own handling of that (waiting out a reload, resending a GET)
  still applies.
  `tests/unit/e2e/wrangler-proxy-patch.test.ts` fails if a wrangler upgrade leaves the patch
  behind: check whether upstream fixed #14641, and if not, re-create the patch for the new
  version with `pnpm patch wrangler@<version>`, edit the extracted package, and run
  `pnpm patch-commit <dir>`, which also records the patch's new hash in `pnpm-lock.yaml`.
- Specs set up and read their data with `apiRequest()` or `apiJson()` from
  `tests/e2e/support/api-requests.ts`, passing the schema of the body they read (see above):
  they call the API through Playwright's request
  client with the page's cookies, so no CORS preflight runs, no `page.route()` stub catches
  the call, and a failure names the request instead of `TypeError: Failed to fetch`. When
  how the browser itself sends a request is what the test checks (a CORS preflight, say),
  the spec sends it with `fetchFromThePageUnderTest()` from the same file: ESLint refuses a
  fetch inside `page.evaluate()` in any other file under `tests/e2e`.
- `trackApiRequests()` in the same file waits for the page's own requests to finish: the
  several that My Templates sends when signing in lands there, or those before a step that
  must be the page's only request (a save meant to meet an ended session). A page often
  sends its next request only once an earlier one answered, so `settled()` also waits until
  none has started or ended for 300 ms.
- Playwright tries a page's routes newest first, so a mock that must answer before a
  catch-all route (`serveLocalAppAsProduction`, a spec's `**/api/**` mock) is registered
  after it, and calls `route.fallback()` for the requests it leaves to the earlier routes.
- A route handler that passes a request on with `route.fetch()` fails the test when the
  page closes before the answer arrives, so a spec with one unroutes in `afterEach`:
  `page.unrouteAll({ behavior: 'wait' })` lets the request finish (the billing status
  stubs), and `{ behavior: 'ignoreErrors' }` drops it (`serveLocalAppAsProduction`).
- Chromium does not always keep a page in the back/forward cache under test, so a spec
  about what Back restores keeps the page and sends the restore itself: the stubbed
  checkout answers with a same-page hash link, and the spec dispatches the `pageshow` event
  with `persisted: true` that a restore fires (`billing-back-from-checkout.spec.ts`).
- `toBeVisible()` passes for an element at opacity 0, so a spec checks a control that fades
  in on focus or hover by its computed opacity.
- A modal dialog takes the page behind it out of the accessibility tree, so `getByRole()`
  finds nothing there until the spec closes the dialog.
- To test what happens while someone types (focus, a value the page rewrites as it
  changes), type with `pressSequentially()`: `fill()` sets the whole value in one change.
- When a step ends in a navigation that waits for the API (a Save that opens the list), wait
  for that response before checking the URL: on a busy machine the save can take longer than
  an assertion's default 5 seconds.
- `setInputFiles()` does not wait for the input to be enabled, and the page ignores a file
  set on a disabled input, so a spec waits for `toBeEnabled()` first (the import page's
  picker stays disabled until the Template list and the plan load). It also dispatches
  `change` every time, even for the file already chosen, where Chromium would not: a spec
  that checks a file can be chosen again checks that the input is empty after each choice.
- A double click whose second click must land on what the first one changed (the next
  task's button, a dialog that opened) is two `page.mouse` clicks with `clickCount` 1 and 2,
  the `event.detail` the browser reports (`run-double-clicks.spec.ts`). `page.mouse` does not
  scroll, so the spec first scrolls the button into view with
  `scrollIntoView({ block: 'nearest' })`, as a person would: `scrollIntoViewIfNeeded()`
  centres it, which pushes the task title out of view, so moving on to the next task scrolls
  the page from under the pointer. The second click must follow within the 500 ms
  double-click interval, so between the two the spec waits only for an element to exist,
  polled per animation frame: waiting for it to be visible and measuring it took over
  500 ms on a busy machine.
- To trace a failed request to the local API, open wrangler's debug log for that run:
  every session writes one, with timestamps and the API's own `api_request` lines, to
  `.wrangler/logs` in your home folder (`%APPDATA%\xdg.config\.wrangler\logs` on
  Windows). Compare it with the times in the test's trace. A reload of the worker
  shows there as `Reloading local server`.
- Reuse stable test identities instead of registering a new account on every run.
  Production auth blocks known test-email domains; keep that coverage when auth
  routes change. A spec that needs a fresh account (an Organization invite, a Free plan
  at its limit) registers one: the stack runs with `wrangler.toml`'s top-level vars, which
  turn email verification off (`AUTH_EMAIL_VERIFICATION_REQUIRED`), so the new account is
  signed in at once and returns to its `next` path.
- Billing is on only where Stripe keys are set, which CI's stack lacks, and without it the
  app offers no upgrade. A spec about the upgrade path reports billing as enabled with
  `reportBillingEnabled()` from `tests/e2e/support/billing.ts` and answers checkout itself,
  so it never reaches Stripe.
- Handler tests assert the public contract, not incidental query order. Request
  the legacy template backup explicitly with `?format=backup`; the default export
  is portable.
- API handler unit tests mock `drizzle-orm/d1` at the adapter boundary with chains of
  `vi.fn()` and keep real schema and query expressions. `drizzleChainMocks()`
  (`tests/support/drizzleChainMocks.ts`) builds the select, insert, update and delete chains
  (an insert's `select` is the `INSERT ... SELECT` of a guarded write) and a `db` that
  returns them, and `chainSelectsUpdatesAndDeletes(dbMocks)` makes `from`, `leftJoin`,
  `where` and `set` chain again whatever an earlier test made them return. Never build a
  chain of your own: import the mocks from the support module that fits, as the first import
  after Vitest's:
  - `tests/support/mockedDrizzleD1.ts` mocks only `drizzle-orm/d1` and exports `dbMocks`, for
    a test of code that reads its own session or entitlements (the entitlements module, Run
    Keys, profiles).
  - `tests/support/apiHandlerMocks.ts` adds the session and entitlements mocks, `mockEnv`,
    the `FREE_PLAN`, `PRO_PLAN` and `TEAM_PLAN` entitlements, and the resets each
    `beforeEach()` starts from: `resetToASignedOutVisitorOnTheFreePlan()`, then
    `signInWithPlans(userId, personalPlan, organizationPlan)`, or both at once with every
    guarded write applied (`resetToASignedInUser()`).
  - `templatesHandler.ts` and `checklistsHandler.ts` add the guarded-insert mock below and
    the response schemas; `agentMcpHandler.ts` and `teamsHandler.ts` hold the MCP and teams
    mocks and fixtures.

  The resets clear every mock, and also `mockReset()` the calls a test queues rows and batch
  results on (`limit`, `orderBy`, `batch`): `vi.clearAllMocks()` keeps the values a test
  queued with `mockResolvedValueOnce()`, so a test that stops early (an early `400`) would
  leave its rows to the next one.

  A test that inspects the rows guarded inserts write (audit events, a new run) mocks
  `@functions/api/utils/guarded-insert` with `guardedInsertsThroughThePlainInsertMock()`
  from `tests/support/guardedInserts.ts`, so they reach the plain insert mock. The guards
  themselves are tested in `audit-guards.test.ts` and the local D1 tests
  (`pnpm run test:local-d1`).

  A support module that calls `vi.mock()` itself works because Vitest hoists the calls to
  the top of that module, so a test file that imports it before the code under test gets the
  mocks in everything it imports after. A value made with `vi.hoisted()` there is exported
  with a separate `export { ... }`, since Vitest refuses `export const x = vi.hoisted(...)`,
  and a value imported from another module is re-exported with `export { x } from`, since
  Vitest's rewrite of the imports leaves a plain `export { x }` naming nothing.

- To run a real handler, Drizzle query or Better Auth's Drizzle adapter on SQL, use `SqliteD1`
  from `tests/support/sqlite-d1.ts`, the one stand-in for D1: a node:sqlite database behind the
  D1 calls Drizzle makes, with foreign keys enforced and every batch a transaction, as on D1
  (`tests/unit/db/sqlite-d1-stand-in.test.ts`). `new SqliteD1()` applies every migration;
  `new SqliteD1({ schemaSql })` applies only the statements a test gives it, for a test that
  needs a few tables (billing, the sitemap queries). Pass its `binding` as `env.DB`.
  - `beforeNextBatch()` commits a competing write just before the handler's next
    `db.batch()`, to test SQL guards and races. See
    `tests/unit/functions/api/teams-sqlite.invites.test.ts`, whose seeded Organization comes
    from `tests/support/teamsSqlite.ts`.
  - `queries` records every statement, and `queryPlan()` returns `EXPLAIN QUERY PLAN` for one.
  - `setStatementHook()` runs before each statement with its SQL and parameters: throwing
    there fails that statement as a D1 outage would (`D1_ERROR: Network connection lost`),
    and `null` removes it.
  - `rows()` and `run()` read and write directly, `sqlite` is the node:sqlite database, and
    `readMigration()` reads one migration's SQL.
  - Its `raw()` reads rows as arrays, which Drizzle maps by column position, through
    `allRowsAsArrays()` (`tests/support/sqliteRowArrays.ts`), which turns on node:sqlite's
    `setReturnArrays()` and parses the rows with Zod.
- `pnpm run test:local-d1` runs the API on real local D1 through wrangler's
  `getPlatformProxy`, with no dev server. `startLocalD1()`
  (`tests/integration/local-d1-handler-env.ts`) applies every migration to a throwaway
  database in its own temp directory and returns the handler env and a `dispose()` that
  removes it. `runToolInRepo()` and `platformProxyOnLocalD1()` there run wrangler or tsx
  from the repository root and open a proxy on a database a test built itself. Each file
  starts its own D1 and takes about 20 seconds, so run a changed one alone:
  `pnpm exec vitest run <file> --testTimeout=20000 --maxWorkers=1`.
- `tests/integration/rows-read-budgets-local-d1.test.ts` (in `test:local-d1`) holds the
  rows-read budget of every hot request, in one table with each budget's reason, and fails
  when a request reads more: a lost `LIMIT` or index shows as a failed budget, not a slow
  test. It takes about 45 seconds. How it measures, and how to update a budget when a route
  is meant to read more, is in [D1 cost](d1-cost.md#measuring).
- Billing tests on SQLite build their tables with `billingSchemaSql()` (the users, Stripe and
  entitlement override tables), send checkout and portal requests with `postToBilling()` and
  seed users, customers and subscriptions with the helpers in
  `tests/support/billingCheckout.ts`.
  Webhook tests send `signedWebhookRequest()` from
  `tests/unit/functions/api/support/stripe-webhook.ts`, which signs the event, so the
  handler's own signature check runs.
  A file that checks out more than 10 times a minute for one user mocks `checkRateLimit`
  to allow every request: the per-account limit on checkout and portal (tested in
  `billing-handler.test.ts`) would refuse its later tests.
- MCP tests send their requests with `mcpRequest()` and `mcpToolCall()` from
  `tests/support/agentMcp.ts`. A test that makes more calls than one Run Key may make in a
  minute (`RUN_KEY_REQUESTS_PER_MINUTE`, counted per key in the process) gives each call a
  key of its own with `authenticateWithAFreshRunKey()`, or the limit answers `429`.
  `readTemplateInFull()` (`tests/support/templatePages.ts`) and `readRunInFull()`
  (`tests/support/runPages.ts`) read a template or run the way an agent does, whole when it
  fits, otherwise its outline, each section by id and a run's retired work a page at a time,
  joining the parts of anything too large for one result, to show it can be read in full.
- A test that reads values from the deployed configuration (the CORS allowlists, the auth
  policy, the D1 bindings) takes them from `wrangler.toml` with `wranglerEnvVars(environment)`
  or `readWranglerToml()` from `tests/support/wranglerToml.ts`, so a change to that file is
  tested too. They parse the file with `smol-toml` and then Zod, never with a regular
  expression.
- Unit tests run in UTC: `vitest.config.ts` sets `TZ` before Vitest starts its workers, which
  inherit it, so a date renders the same on every machine and in CI
  (`tests/unit/config/test-environment.test.ts`).
- Vitest runs each test file in one of two projects (`vitest.config.ts`):
  - a file named `*.dom.test.tsx` runs in happy-dom, a DOM implementation in Node, and is
    the only kind of file that renders into a DOM;
  - every other test runs in Node with no DOM: the API, script and config tests, and every
    static render, since a server render has no `window`. happy-dom also replaces Node's
    `fetch`, `Request` and `Response` with its own, which the API tests must not get.

  `tests/unit/config/test-environment.test.ts` and `test-environment.dom.test.tsx` check
  each side. The root config is the Node project and declares the DOM project inline, since
  Vitest 3 hands the `--exclude` that `test:run` passes for the local D1 tests to the root
  project only. happy-dom follows no link (the `navigation` settings in `vitest.config.ts`),
  so a click the app leaves to the browser loads nothing.

  happy-dom was chosen over jsdom, both maintained (happy-dom 20.14.5 from September 2026,
  22 million downloads a week; jsdom 30.1.1, 124 million): the DOM test files run in 32 s in
  happy-dom and 53 s in jsdom (`--maxWorkers=2`), jsdom has no `matchMedia`, which
  `useMediaQuery` reads, and jsdom 30 needs Node 22.22. With the DOM tests in happy-dom the
  unit suite (`pnpm exec vitest run tests/unit src --maxWorkers=2`) took 248 s, against 222 s
  on the hand-written fake DOM it replaced.

  So a component test takes one of three routes:
  - Render the component to HTML with `renderToStaticMarkup` and read the markup.
    `tests/unit/components/accessibleMarkup.ts` finds its controls (fields, buttons and any
    element with a widget role) and names them as a screen reader does: `aria-labelledby`,
    `aria-label`, a `<label for>`, or a button's text, never a placeholder.
    `tests/unit/components/focusVisibility.ts` finds a focusable element that is invisible,
    or hidden from assistive tech, while it has focus.
  - Call the component as a function, with React's hooks replaced in `vi.mock('react')`, and
    search the element tree it returns (`tests/support/elementTree.ts`) for handlers and the
    next component's props. A hook test calls the hook the same way, inside a plain function
    component. `tests/support/hookStateSlots.ts` keeps state, refs and effects between calls
    by call order, as React keeps them between renders (`hooksKeptBetweenRenders` replaces
    `useState`, `useRef`, `useEffect`, `useMemo`, `useCallback` and `useSyncExternalStore`
    at once): `renderKeepingState` renders again, an effect runs during the call when its
    dependencies change, and `unmountEffects()` runs the cleanups.
    `createFormControlMountedLikeUseForm` (`tests/support/editorFormControl.ts`) gives the
    template editor a real react-hook-form control.
  - Render it into the DOM with Testing Library, in a `*.dom.test.tsx` file, when the test
    needs effects, focus or clicks. `renderSettled(ui)` (`tests/support/renderInTheDom.ts`)
    renders inside `act()` and waits for the effects, and Testing Library unmounts every tree
    after each test. Find what a user finds: by role and name
    (`screen.getByRole('button', { name: 'Save' })`), by label (`inputNamed('Email')`) and by
    text, rather than by a class, an id or React's props on a node.
    `theButtonOrMenuItemNamed(name)` finds a control a menu may render as either. Act with
    `fireEvent`: `fireEvent.click()`, with `{ detail: 2 }` for the second click of a double
    click, a `createEvent.click()` passed to `fireEvent()` when the test reads whether the app
    prevented the default, and `typeInto(field, value)`, which fires the change React listens
    for. A hook that needs
    React's own effects or TanStack Query runs in a probe component that renders nothing
    (`mountQueryHook()` in `tests/support/queryHookProbe.tsx`, `mountAuth()` in
    `tests/support/authProviderHarness.tsx`). `letQueryUpdatesReachObservers()`
    (`tests/support/queryNotifications.ts`) waits, inside `act()`, the few timer rounds an
    answer takes to reach the observers and render.

  Base UI's overlays render nothing until they open, and their portals render nothing in a
  static render, so a test of what a dialog, alert dialog, menu or select shows renders it in
  the DOM, the real component: it opens it as a user does (a click on its trigger;
  `openTheMenu(label)` for a menu, which first waits for any menu still closing), finds it by
  role (`dialog`, `alertdialog`, `menu`, `menuitem`), and answers it with a click
  (`openAndConfirm()` and `clickInTheDialog()` in `tests/support/confirmDialogs.ts`). Base UI
  unmounts an overlay only after its exit transition, a few frames after it closes, so a test
  waits for that with `waitFor` or `waitForElementToBeRemoved` (`theDialogsToClose()`); a
  check made at once passed or failed with the machine's load. A dialog the page left open
  is checked at once. Testing Library unmounts the portals with the rest of the tree after
  each test. The template detail page's static tests (`tests/support/templateDetailPage.tsx`)
  render its More menu's items in place, to read the props the page gives them.

  A test that renders a failed query statically seeds the failure with `seedQueryError()` on
  `createTestQueryClient()` (`tests/fixtures/queryClient.ts`), which does not retry on mount,
  so the error shows instead of the fetching state of a query about to retry; `data` makes it
  a refresh that failed after a successful load. A static render runs no effects, so a page
  never counts as shown to `usePageVisit` and drops every late result: a test that acts as a
  user still on the page mocks `@/hooks/usePageVisit` with `pageVisitOfAUserStillOnThePage`
  (`tests/support/pageVisitMock.ts`).
- The App Router exists only in a Next.js app, so `tests/support/` stands in for what the
  app imports from Next.js:
  - `nextNavigation.tsx` replaces `next/navigation` and `next/link` with an in-memory
    browser (`inMemoryBrowser.ts`), so the app's `Link`, `useAppRouter` and leave guard run
    for real. `mockedNextNavigation.ts` mocks both modules with it and exports `navigation`;
    import it first, before anything that loads the app:

    ```ts
    import { navigation } from '../../support/mockedNextNavigation';
    ```

    `navigation.reset(url, options)` starts each test (after any `vi.resetAllMocks()`) from
    one entry at a path, or at an absolute URL for another origin. `params` fixes the route's
    params for every URL, enough for static rendering; `routes` lists App Router patterns
    (`/categories/[categorySlug]`) whose params then follow each URL; `before` lists earlier
    entries, oldest first; `state` is the current entry's history state. The stand-in `Link`
    handles a click as `next/link` does (`next/dist/client/app-dir/link.js`): its own
    `onClick` first, a modified click, a download or another origin left to the browser, and
    an `onNavigate` that may cancel; `data-prefetch` shows the `prefetch` prop Next.js would
    get (`unset` for its default). The router's `push` and `replace` add or replace an entry,
    and a navigation to the URL already open replaces it, as in Next.js. `usePathname`,
    `useSearchParams` and `useParams` follow the current entry, including one written with
    `pushState` or `replaceState`. `navigation.router` is what `useRouter()` returns, with
    `vi.fn` methods; `navigation.log` lists each navigation and whether a `Link` or the
    router sent it, and `navigation.documentLoads` each full page load. A DOM test makes
    `navigation.window` (its history and location, events, storage and a `confirm()`
    answering true) the page's window with `theInMemoryBrowserAsTheWindow()` for a file or a
    `describe` block, or `onTheInMemoryBrowser(run)` for one test
    (`tests/support/renderInTheDom.ts`); what it does not stand in for, such as the document
    and the element classes, comes from happy-dom's window. A static render that reads the
    window installs it with `navigation.installWindow()`. Back, Forward and `go()` fire
    `popstate` on a later task, as a browser does: `navigation.settle()` lets one run, so a
    Back the page answers with a traversal of its own needs two. `<RoutedPages>` renders the
    page whose pattern matches, remounted for another pattern or other params and kept for the
    same URL or another query, as the App Router does; `renderPageAt()` returns a URL's
    server HTML, with no effects. A navigation lands at once unless the test calls
    `navigation.holdNavigationsUntilTheNextPageLoads()`: from then on each `Link` click and
    router navigation is logged when it starts but changes the URL only when the returned
    function runs, in the order they started, as Next.js keeps the current page shown while
    the next one loads (`DashboardHome.dom.test.tsx` races a click with the page's own
    redirect this way).
  - `nextRouting.ts` loads `next.config.ts`'s redirects and headers as `next build` does for
    a build's `SITE_ENV` (`loadBuiltRoutes()`; `withSiteEnv()` from `siteEnv.ts` sets the
    variable, or leaves it unset for `undefined`) and answers a URL the two ways the app is
    served: `nextServerRedirect()` as `next dev` and `next start` do, and `workerRedirect()`
    through OpenNext's routing in the Worker, for which the test mocks
    `@opennextjs/aws/adapters/config/index.js` with `openNextBuildConfig()`. A request's
    `Host` comes from its URL. `headersFor()` gives the headers a response gets. OpenNext
    publishes `@opennextjs/aws` unbundled, with extensionless imports meant for its own
    bundler, so `vitest.config.ts` inlines it (`server.deps.inline`) for Vite to resolve.
  - `nextServerContext.ts` is what `src/server` reads from Next.js and OpenNext: mock
    `@opennextjs/cloudflare` with `cloudflareMock`, `next/headers` with `headersMock` and
    `server-only` with an empty module, then set `serverContext.env` and the host.
    `createEdgeCache()` is a data center's Cache API
    (`vi.stubGlobal('caches', { default: edgeCache.cache })`) and `unreachableD1` fails every
    query.
  - `next/font/google` is compiled by the Next.js build, so `vitest.config.ts` resolves it
    to `nextFontGoogle.ts`, which returns the shape the root layout reads.
- Coverage settings live under `test.coverage` in `vitest.config.ts`
  (`pnpm run test:coverage`); `@vitest/coverage-v8` must match the Vitest version.
  If you override `test.exclude`, keep `node_modules`, `dist`,
  `playwright-report`, `test-results`, `tests/e2e/**`, and `tmp/**` excluded.
- If production test accounts must be removed, inspect dependent rows first and
  clean auth, templates, runs, likes, analytics, entitlement, and Stripe records
  as one deliberate maintenance operation.
