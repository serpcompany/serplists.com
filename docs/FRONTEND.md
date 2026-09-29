# Frontend

A Next.js 16 app (App Router, React 19) in `src/`, in TypeScript (`strict`), running on
Cloudflare Workers through OpenNext ([ARCHITECTURE.md](../ARCHITECTURE.md)). Server state
goes through TanStack Query and UI through shadcn/ui on Tailwind ([DESIGN.md](DESIGN.md)).
Path aliases: `@/*` maps to `src/*`, `@functions/*` to `functions/*`.

## Structure

| Path | Role |
| --- | --- |
| `src/app/` | Routes: layouts, pages (each renders a view and declares its metadata), route handlers (the API, the sitemaps), and the providers (`providers.tsx`) |
| `src/server/` | Server-only code the route files use: the Worker's bindings, page metadata lookups |
| `src/views/` | Route screens (client components): compose components and feature models |
| `src/components/` | Feature UI; `components/ui/` holds presentational primitives |
| `src/features/*/` | Headless feature models (`use*Model.ts`) and mappers from API shapes to domain types |
| `src/contexts/` | Auth, Ownership Context (legacy `WorkspaceContext`), Templates and Runs |
| `src/hooks/` | Shared hooks |
| `src/lib/api.ts` | The only HTTP client (transport) |
| `src/lib/schemas/`, `src/types/` | Zod schemas and domain types, shared with the API |

Enforced by `pnpm run deps:check` ([ARCHITECTURE.md](../ARCHITECTURE.md)): pages and
components never call `src/lib/api.ts` at runtime (put the call in a feature model
or context), `components/ui/` stays presentational, only the route files in `src/app`
and `src/server` import `functions/`, client code never imports `src/server`, and every
module must be reachable from a route file in `src/app`. Remaining legacy call sites are
tracked in the [UI decoupling plan](exec-plans/active/ui-decoupling.md).

Canonical private routes live under `/dashboard/*`; the full route list is in
[system overview](design-docs/system-overview.md#routes). Public pages sit in the `(site)`
route group and signed-in pages in `(app)`, whose layout checks the session first
(`RequireAuth` sends a signed-out visitor to `/login/?next=<path>`). Both layouts render
`Layout`, which picks the public or console shell from the pathname.

The views are client components, and the server renders them too. A view must render the
same HTML on the server and in the browser's first render, or hydration fails: never read
`window`, `document` or browser storage while rendering (read them in an effect, or with
`useSyncExternalStore` and a server snapshot, like `useCurrentPath`), and never keep one
visitor's data in module-level state, which the server would share with the next visitor.
A view that reads the query with `useSearchParams` on a statically rendered page is
wrapped in `<Suspense>` in its route file (`/templates/`, `/login/`, `/register/`,
`/reset-password/`): the server sends the fallback and the browser renders the rest.

In-app links use `Link` (`src/components/navigation/Link.tsx`) and code navigates with
`useAppRouter` (`src/lib/navigation/useAppRouter.ts`); both ask a page holding unsaved work
first (below). A page that drops one-shot query parameters once it has read them (a reset
token, the login notices, `?billing=`) or keeps its filters in the URL (the library) rewrites
the current entry with `replaceCurrentUrl` (`src/lib/navigation/replaceCurrentUrl.ts`), the
History API that Next.js follows: the page keeps its state and nothing is fetched. Return
paths travel only in the `next` query parameter (`withReturnPath` and `getReturnPath` in
`src/lib/auth/returnPath.ts`, which sanitizes them), never in history state.

Every page renders inside `RouteErrorBoundary` (`src/components/RouteErrorBoundary.tsx`):
`Layout` wraps its content, and routes outside `Layout` (the shared run page) wrap their
element. A page that throws while rendering shows a "Something went wrong" card with Try
again, Go back and a home link, the header and navigation keep working, and opening another
page clears it, and so do the card's own buttons (the boundary resets when the pathname
changes, and only while it shows an error, so healthy pages are never remounted). The
`ErrorBoundary` around the providers in `src/app/providers.tsx` is the last resort: its
fallback uses plain links, and browser Back clears it.

Next.js gives each value of a dynamic segment its own page instance. `CategoryDetailRoute`
also keys the category page by its normalized slug, so another category always starts with
an empty search and the default sort; `TemplateEditorRoute` does the same for the editor
(below).

Next.js scrolls to the top, or to the URL's `#anchor`, when a navigation opens another
page, and Back and Forward restore the scroll position. Rewriting the query in place (the
library's search) never scrolls. Pages scroll the window, not an inner container.

## URLs

The app follows the SERP URL standard (`src/lib/http/urlStandard.ts`): a page ends in a slash
(`/about/`, `/profile/<user>/<slug>/`), a file never does (`/robots.txt`,
`/sitemaps/pages/1.xml`), and the other form of either answers 308 with the canonical URL, in
one hop. A profile page is a page even when its username looks like a file name
(`/profile/john.doe/`). The API (`/api/...`) and `/.well-known/` are not pages: they answer at
the path they are called with and are never redirected, since Better Auth, the Stripe webhook
and agents (MCP) call them directly and do not follow redirects.

- Link with the builders in `src/lib/routes.ts`, which return canonical paths, and never write
  a page path by hand: no link may depend on a redirect. `tests/unit/lib/canonicalUrls.test.ts`
  checks every builder, the sitemap entries and the links the API writes, and scans `src` for a
  hard-coded link that is not in canonical form or that redirects.
- `usePathname()` and `location.pathname` report the slashed form. Compare paths with the
  route helpers (`isPathWithin`, `resolveRouteShell`, `resolveConsoleSection`), which accept
  either form, not with `===` or `startsWith` on a literal.
- `next.config.ts` sets `trailingSlash: true`, so the URLs Next.js writes (canonical and Open
  Graph URLs) get their slash, and `skipTrailingSlashRedirect: true`: Next.js's own
  trailing-slash redirect would move the API too, and OpenNext skips its redirect for files.
  `redirects()` does that work instead (`trailingSlashRedirects()`), after sending the legacy
  paths (`/account`, `/console/*`, `/checklists`, `/dashboard/profile`) straight to their page's
  canonical URL. `tests/unit/config/urlStandard.test.ts` runs every rule through Next.js's
  server and OpenNext's routing, and `tests/e2e/site-standards.spec.ts` checks them in workerd.
- `/dashboard/` is not a page: typed or bookmarked, it answers 307 with the dashboard's home,
  My Templates for now. Links use `buildConsoleHomePath()`, which returns the home itself.
- `sanitizeReturnPath` returns a `next` return path in canonical form, so an older link opens
  its page without a redirect.
- Each environment answers on one host: `www.serplists.com` and every `*.workers.dev` URL
  redirect there in one hop (see [RELIABILITY.md](RELIABILITY.md#environments-and-hosts)).

## Unsaved changes

A page that holds unsaved edits must ask before they are lost, whichever way the user
leaves. `src/lib/navigation/useUnsavedChangesGuard.ts` covers every way out (the
first three points below); the template editor (`useTemplateEditorLeaveGuard`) and
the run page (unsaved task notes) use it. A page's own back buttons just navigate and
let it ask, so the user is asked once.

- The app's `Link` and `useAppRouter` ask before opening another page: sidebar, header,
  account menu, in-page links and buttons. They ask only when the pathname changes.
- Browser Back/Forward: the guard pushes a same-URL history entry above the page's own,
  so Back lands on it first (the page stays) and the page asks there before going on.
- Actions that leave the page without a navigation it can block first, such as Sign
  out (which unmounts the page), go through `src/lib/navigation/leaveGuard.ts`; the
  page registers with `registerLeaveGuard`. Sign out uses `leaveAfterConfirmed`: it
  asks first, and if the server refuses the sign-out the user stays and the page asks
  again next time.
- `beforeunload` covers reloads, tab closes, and external links.
- A session that ends in the background (a sign-out in another tab, an expired or
  revoked session, another tab signing in as someone else) unmounts the page without
  asking. Just before that, `keepGuardedWork` asks each page with unsaved work to keep
  it on the tab (the guard's `onSessionEnding`), and the page offers it back after
  sign-in. The template editor keeps a new template's draft, or its edits to an
  existing template with the version they were made on, so a save made since then
  ends in a conflict instead of an overwrite (`templateDraftStore.ts`). The run page
  keeps unsaved task notes and restores those whose saved notes did not change
  (`keptNoteDrafts.ts`). When storage is blocked or full, a toast says the changes
  could not be kept.
- A save in flight does not lift the guard: it can still fail (a conflict, a slug
  rule, a network error, or the unload aborting it), and until it succeeds the edits
  exist only in the form. Leaving during a save asks with a message that says the
  template is still saving, and a save that finishes after the user left does nothing
  on the page (a create does not redirect them); its outcome is still reported as a
  toast.
- A file still uploading counts as unsaved work even when the form is clean: it
  reaches the form only when the upload finishes. The template editor tracks uploads
  in `pendingUploads.ts`, disables Save ("Uploading...") until they finish, and asks
  before leaving with a message that says a file is still uploading.
- A navigation the page starts after it has nothing left to lose (a create that
  saved, completing a run, which saves every note, or a checkout or sign-in redirect
  after the draft was kept) is allowed without asking. Back from checkout can restore
  the page from the back/forward cache with that exit still allowed, so the guard
  re-arms on that restore: edits made after coming back are not in the kept draft.
- An action on the page that replaces the whole form asks the same way. Generating a
  Clipy draft asks before the request when the form has unsaved changes
  (`confirmReplaceTemplateDraft`), locks the editor and Save while it runs so nothing
  typed meanwhile is replaced, and drops a draft that arrives after the editor closed.
  Restore draft (the new-template draft kept across checkout or sign-in) asks first
  when the form has unsaved changes or a file still uploading
  (`restoreKeptTemplateDraft`); a no leaves the form and the draft notice as they were.
  Restore draft and Discard are disabled while a create saves or a Clipy draft
  generates.

## Data and state

- `src/lib/api.ts` handles the base URL, JSON, and structured errors, and sends the
  Better Auth session cookie with `credentials: 'include'`. It never stores tokens.
  Responses are not yet parsed with Zod (TD-2 in the
  [tech debt tracker](exec-plans/tech-debt-tracker.md)).
- Contexts and feature models own server state with React Query. Query keys include
  the user id and the active Ownership Context so Personal and Organization data
  never mix. Switching context only marks the Template and Run lists stale
  (`refetchType: 'none'`, catalog excluded, nothing when the context is unchanged): the
  page's observers are still on the old context's keys at that moment, so a refetch
  would reload the lists being left. The new context's lists load once when the page
  moves onto their keys (`markListsStaleForWorkspaceSwitch` in
  `src/contexts/templateListCache.ts`). Billing keys
  include the user id; never show a Free or Pro label while status is loading, and
  treat a failed status as unknown, never Free (`getBillingPlanStatus`).
  Build other private keys (invites, Organization members, Run Keys, archives) with
  `queryKeys` in `src/lib/queryKeys.ts`, and give those queries `enabled: Boolean(userId)`.
  The archive lists load only on `/dashboard/archive/`; deleting a Template or Run
  marks them stale through `src/contexts/templateListCache.ts`. Deleting a Template also
  removes it from the cached catalog and leaves the catalog fresh instead of stale: the
  edge cache can serve the pre-delete catalog for up to 5 more minutes, so a refetch
  would list the deleted Template again. Each list reads as
  loading until it has data or its request failed (`getArchiveListState`), including
  while it waits, disabled, for the Organizations to load.
- Sign-out and sign-in are SPA navigations, so the QueryClient outlives a session.
  When the signed-in user changes, `AuthProvider` removes every cached query no
  mounted page reads, except the public catalog. Never call `refetchQueries` without
  `type: 'active'`: an inactive key keeps the query function (and user) of the page
  that last read it. Invalidate instead.
- React Query v5 reports a failed first load as `isLoading: false` with no data, so
  a list that only checks `isLoading` shows its empty state for an error. Render
  query-backed lists with `QueryListState` (`src/components/shared/QueryListState.tsx`):
  loading, a load error with Retry, the empty state only for a loaded empty list,
  and the last loaded list (with a Retry notice) when a refresh fails.
- Template and run lists load on demand. `TemplatesProvider` wraps every route but
  never fetches them. A page that reads `templates` (the public catalog) calls
  `useTemplateLists({ catalog: true, workspace: false })`, one that reads `allTemplates`
  calls `useTemplateLists()`, and one that reads `runs` adds `runs: true`. The run page
  fetches its own run by id, and the template editor and the template detail page their
  own template: a page that needs one Template or run never loads a list just to look it
  up, and an editor must never start from a list copy, which can be minutes old. A catalog miss reads every public Template from D1
  ([D1 cost](design-docs/d1-cost.md)), so pages that only need official templates use
  the bundled `repoTemplates`. The catalog's query key has no user id because the
  catalog is the same for everyone, so it waits only for the session; the workspace
  and run lists also wait for the active context (`src/contexts/templateListObservers.ts`).
  A failed teams request must not hide the public library. Only pages that display the
  catalog may load it; `tests/unit/contexts/catalogConsumers.test.ts` lists them, and
  data built on the server (such as the import/export pack) never needs it on the
  client. In Personal, `allTemplates` merges the catalog with
  the user's own list; once that list has loaded it is the source of truth for the
  user's Personal templates, so a cached catalog copy it lacks (deleted, made private,
  or moved to an Organization) is dropped.
- Context values and helpers (`getTemplate`, the lists) keep their identity until their
  data changes, but never key a fetch on them: providers still re-render for unrelated
  reasons. Actions (`updateRun`, `deleteRun`, `createTemplate`, ...) keep theirs for the
  life of the provider. The run page loads its run only when the run id or share token
  changes, and reads callbacks when it uses them, since a load clears unsaved task
  notes and the selected task.
- Template detail pages never show a copy from a list: a list is refetched after an
  edit only while a page observes it, so an unobserved copy can be arbitrarily old. The
  public template page loads its template from the API on every visit (bundled library
  templates excepted). The private detail page loads its template by id (slug as a
  fallback) with a query keyed under `['templates']`, so every template invalidation
  (editor saves, visibility, Share, copies, context switches) refetches it
  while it is open and the next write sends the version the server holds. Archiving a
  template only marks its own detail and Changelog entries stale, since a reload would
  ask for a template that is gone (`markArchivedTemplateStale` in
  `src/lib/queryCache.ts`). Restoring one removes the detail entries no page shows that
  hold it or a "gone" answer, so it opens with the spinner. A cached "gone" answer that
  is being fetched again shows the spinner, and one whose fetch failed offers Try again,
  never "not found". Both loads
  are keyed only on the template (and, for the private page, the viewer), so an
  unrelated re-render never reloads them. A background refetch, including the reload
  after a `409` edit conflict on Share or the visibility switch, swaps the template in
  place without the page spinner, and a visibility change keeps the version its `PUT`
  answer returns.
- `templates` always includes the bundled `repoTemplates`, so a non-empty list does not
  mean the catalog loaded. Discovery pages read `catalogPending` and `catalogError` from
  `useTemplateLists` (`loading`, `catalogError`, and `retryCatalog` in
  `useTemplateLibrary`): show a skeleton while pending, a retry state on error, and a
  404 or "no templates" message only after the catalog loaded. That includes category
  lists and counts (`/categories/`), which would otherwise count only the bundled
  templates; `tests/unit/contexts/catalogConsumers.test.ts` checks every page that uses
  `useTemplateLibrary`. A failed catalog request stays an error; it is never cached as
  an empty catalog.
- Browser storage goes through `src/lib/browserStorage.ts` (`safeLocalStorage`,
  `getLocalStorage()`, and `getSessionStorage()` for session storage). When a browser
  blocks site data, even reading `window.localStorage` throws, and one unguarded read in
  a component mounted on every route replaces the whole app with the error screen. The
  helper never throws and keeps values it cannot persist in memory for the session.
  ESLint rejects direct access anywhere else in `src/`.
- After a write, reload the affected query with `reloadQuery`
  (`src/lib/queryReload.ts`), not `refetch()` or `fetchQuery`. Those join a fetch
  already in flight (a first load, for `refetch()`), which read the server before
  the write and puts the old list back when it lands.
- Mutations are complete only when the persistence promise resolves. Do not
  navigate or report success from a fire-and-forget mutation, and preserve fields
  you are not editing (for example, `rules`) on update.
- The page that starts an action owns its feedback. Shared mutations in contexts
  (`createTemplate`, `updateTemplate`, `createRun`, ...) only update the cache and
  reject on failure; they never toast, or every action would show two messages. A
  page shows one toast per outcome, or none when it redirects (sign-in, checkout)
  or shows the error inline (the template editor).
- Send only the fields a save changes. Private run saves (ticks, notes, completion)
  leave the title out and only a rename sends it (`src/contexts/runUpdatePayload.ts`):
  a stored title can be longer than the API's 160-character limit, and resending it
  would fail every save on that run.
- After an await, move the user (navigate, sign-in or checkout redirect, a dialog)
  only if they are still on the page that started the action: the router still runs
  a navigation from a page the user has left. Call `beginVisit()` from
  `usePageVisit` (`src/hooks/usePageVisit.ts`) when the action starts and check
  `visit.isCurrent()` after the request; it is false once the page unmounts or the
  user navigates (Back, a link, even to the same page, another id on the same page).
  Next.js has no location key, so the app's `Link` and `useAppRouter` report each
  navigation they start (`src/lib/navigation/navigationSignal.ts`). The template editor
  passes `{ endOn: "pathname" }`: the sidebar's New Template link on the new-template
  page keeps the editor mounted at the same path, and a create in flight must still
  finish and leave for My Templates. The request's own
  result stands: cache updates still happen. The template pages route Start Run,
  Copy/Save and Share results through `followTemplateActionResult`; My Templates
  passes the visit to `reportDashboardTemplateRunFailure`, and template import and
  export pass `isCurrent` to `handleAccessFailure`. A plain error is still shown
  after the user has left. `tests/unit/views/navigateAfterAwait.test.ts` scans `src/`
  and fails when an async handler navigates, signs in or starts checkout after an
  await outside a visit gate (an `if (visit.isCurrent())` branch, an early return once
  the visit has ended, a callback given to one of the visit helpers, or a call that is
  passed the visit), unless it is listed as ungated on purpose. It also fails when a
  file uses a sign-in or checkout helper without calling `usePageVisit`.
- Surface API failures by their structured code, not message text: `401` means sign
  in (keep the return path), `403 upgrade_required` and `403 limit_reached` mean a
  plan gate, `503 billing_unavailable` means checkout is down. Keep the kind with
  `getAccessFailure` and offer the way forward: Personal checkout
  (`startBillingCheckout`) in Personal, the paid-Organization message in an
  Organization (a Personal checkout cannot lift its limits).
- `authClient` (Better Auth) calls resolve with `{ data, error }` on HTTP failures
  instead of throwing. Check `result.error` before reporting success or doing any
  follow-up that assumes the change was saved, such as deleting the old avatar file.
- Query functions reject when a request fails; never catch and return `[]`, which
  caches an empty list as fresh data and hides the error. Template and run list
  fetchers (`src/contexts/templateListFetchers.ts`) parse rows one at a time and skip a
  malformed row. `useTemplateLists()` returns `templatesError` and `runsError`, set only
  while the failed list has no data (a failed refetch keeps the last good list). A page
  shows `ListLoadErrorState` (Retry, or Sign in on a `401`) whenever one is set. Never
  decide by the length of a merged list: in Personal the cached catalog can still hold
  the user's public templates while the Personal list itself failed.
- Parse timestamps from the API with `parseDbTimestamp`, or format them with
  `formatMonthYear`, `formatLocalDate` or `formatLocalDateTime`, all in
  `src/lib/utils/dbTimestamp.ts`, not `new Date(value)`. Columns that default to D1's
  `CURRENT_TIMESTAMP` (such as `users.created_at`) hold UTC as `YYYY-MM-DD HH:MM:SS`,
  which Safari cannot parse and other browsers read as local time. The formatters
  return nothing (`''` or `null`) for a value they cannot read; render nothing then,
  never "Invalid Date".
- A button that sends the browser to another site (Stripe Checkout or the Customer
  Portal) takes its pending flag from `useRedirectPending`
  (`src/hooks/useRedirectPending.ts`). The flag stays set after the redirect starts,
  so a second click cannot open a second session. Back can restore the page from the
  back/forward cache with its React state intact, so the hook clears the flag on that
  restore, and Billing, Pricing and the template editor refetch billing status too.
  Every checkout entry point uses it, including the Start Run dialog on My Templates
  and the editor's Upgrade to Pro; `tests/unit/components/billing-redirect-pending.test.ts`
  scans `src/` for pending flags next to a checkout or portal call.

## Template editor forms

- `src/lib/forms/templateEditorDetailsForm.ts` owns the top-level details contract;
  `src/lib/forms/templateEditorForm.ts` owns the combined editor contract, editor
  types with guaranteed ids, and nested field factories.
- Use React Hook Form field arrays for sections, items, content blocks, and
  sub-items instead of a second nested state tree.
- The editor page creates its form only after the template has loaded
  (`TemplateEditorForm` in `src/views/TemplateEditor.tsx`), so nothing mounts against
  the blank defaults. UI state about sections, such as which ones the outline has
  collapsed, is keyed by section id and never seeded from the sections present at
  mount: a Clipy draft, a restored draft, or a save replaces the sections with
  `reset()`.
- Content stored before the API checked every write can hold shapes the editor does
  not use, so `buildTemplateEditorFormValues` coerces it into values the editor schema
  accepts: numeric ids and values become strings, an unknown block type becomes a text
  block that keeps its value, invalid file details are dropped, and every content block
  gets its own id (uploads find their block by id). The editor builds the form from the
  stored sections the API returns, not the display mapper's copy, which drops what no
  page renders. A loaded template can always be saved without losing content. Save
  validation errors inside the outline name the section, task, and content block.
- An image, video, or file block's `fileName` and `fileSize` describe the file its
  value points to: an upload, or a linked file an author named (`uploadType: "url"`).
  Typing in the URL field writes the value with `withMediaValue`
  (`src/lib/utils/mediaSource.ts`), which drops the name and size once the value
  changes and records the source type. `FileUpload` shows the uploaded-file row and
  its Remove button only while the value is an uploaded file, so Remove never clears a
  typed URL. A name saved next to a URL typed over an upload is dropped on load and
  not shown by `ContentRenderer`.
- Omit an empty slug from create and update payloads rather than sending `""`, and
  omit an update's slug when it is the one already stored, so a stored slug that
  predates today's rules never blocks a save or moves the URL. After a save the URL
  Slug field shows the slug the API returned (suffixed when the requested one was
  taken, or the kept slug when the field was left empty).
- Field limits and slug rules live in `src/lib/schemas/templateFields.ts`, shared
  with the API payload schema. The editor schema applies them with messages that
  name the field, and saves are validated before the API call. The URL slug is
  normalized (`slugifyTemplateSlug`, the API's one slug rule from
  `src/lib/utils/slug.ts`) when the field loses focus and on save. Typed text with no
  Latin letters or digits (`Список`, `!!!`) stays in the field and the save is refused
  with "URL Slug: use Latin letters or numbers."; an empty field keeps the stored slug.
- Keep category autocomplete triggers as real text inputs and use `onKeyDown` for
  tag entry.
- Preserve `seoTitle`, `seoDescription`, `slug`/`seoUrl`, and `rules` across save
  and reload.
- The editor never subscribes to a Template list. It loads its template by id and
  keeps the stored `version`. `PUT /api/templates/:id` answers with the `version` and
  `slug` it stored (the slug may carry a `-<id8>` suffix). The next save sends that
  version as `expected_version`, and a failed save keeps the old one. The editor does
  not edit rules, so its saves leave them out and the stored rules are kept. A template
  save only marks the Template lists stale (`refreshAfterTemplateSave`), so Save never
  waits for a list download; the detail page's visibility switch applies the returned
  version itself.
- Editor routes render `TemplateEditorRoute`, which keys the editor by template id
  (`new` for the create form), so errors, selection, and save state never carry over
  from one template to another or to the new-template form. A save that finishes
  after the user moved on still reports its outcome as a toast, but never updates
  the form, shows inline errors, or navigates (`resolveTemplateSaveFeedback`).
- A save sends a deep copy taken at click time (`getValues()` is shallow). When an
  update succeeds, `rebaseTemplateEditorFormAfterSave` makes the saved values the
  form's baseline and keeps any field edited while the save was in flight, so the
  form stays dirty and the unsaved-changes guards still warn.
- The saved values are what was stored, after `applyTemplateSaveDefaults`: a blank
  title becomes "Untitled Template", an untitled section "Section N" (the label the
  outline shows, from `sectionFallbackTitle`), an untitled task "Task N", and an
  empty section gets a "New task" whose id comes from the section id. Blank
  sub-tasks are dropped (the others keep their ids), and so is a Sub-tasks block
  left with none, since runs count every sub-task checkbox toward progress. The
  editor shows them after the save, and the defaults are deterministic, so saving
  again sends the same task ids and active runs keep the task (and its completion).
  A create leaves the page when it finishes, so the editor is locked (a disabled
  `fieldset`) until then.
- Templates and runs saved before those defaults can still hold blank section or
  sub-task titles. Pages render them with `getSectionDisplayTitle` and
  `getSubItemDisplayTitle` (`src/lib/utils/checklistSections.ts`), which fall back to
  "Section N" and "Sub-task N"; a blank sub-task is labeled, never hidden, because
  it still counts toward progress.
- Plan limits (`useTemplateEditorAccess`): the new-template editor warns up front
  when billing status shows the context's template limit is reached, and a save
  refused as a plan gate or for an ended session shows a notice with its action
  (Upgrade to Pro, or Sign in) instead of plain error text. The new template's draft
  is kept in `sessionStorage` (`templateDraftStore.ts`, keyed by user and context)
  before any checkout or sign-in redirect, offered back on the new-template editor
  and from the billing section, and cleared only when it is saved (even by a save
  that finishes after the user left the editor) or the user discards it. Until the
  user restores or discards an offered draft, a different template written in the
  form neither clears nor replaces it, whether that template saves, is refused, or
  is kept for an upgrade, sign-in or ended session; leaving with that other work
  asks first. A confirmed sign-out returns the tab to Personal, so the new-template
  editor also offers a draft kept in another context the user can still create
  templates in, with a switch to that context (`useOtherContextTemplateDraft.ts`);
  the draft is restored, and saved, only in the context it was written for.
- Adding a content type or editor tab: [template content types](design-docs/template-content-types.md).

## Rendering user content

Render Markdown with `MarkdownBlock` (`src/components/shared/MarkdownBlock.tsx`), the
only module that imports `react-markdown`. It disables raw HTML and passes links through
`safeUrl` (`src/lib/utils/safeUrl.ts`); pass other media URLs through `safeUrl` too.

## Page titles and meta tags

Pages declare their `<head>` with the Next.js Metadata API, and the server renders it into
the page's HTML. The root layout (`src/app/layout.tsx`) holds the defaults: the brand as the
title, the site description, and the Open Graph and Twitter tags with the shared image. A
page with tags of its own builds them with `buildPageMetadata`
(`src/lib/seo/pageMetadata.ts`), which titles it "Page | SERP Lists" (`buildPageTitle` in
`src/lib/brand.ts`, which never adds the suffix twice), points the canonical URL and
`og:url` at the page's canonical URL on `https://serplists.com` (`buildCanonicalUrl` in
`src/lib/seo/siteOrigin.ts`, on every environment), and sets robots to `index, follow` unless
the page says otherwise. The route also renders the same text as JSON-LD (`JsonLd` and
`PageJsonLd` in `src/components/seo/`). A build that is not production also sends
`X-Robots-Tag: noindex, nofollow`, which wins over the tag (below).

### Production and other environments

A site is not production unless `SITE_ENV=production` marks it (`isProductionSite` in
`src/lib/seo/siteOrigin.ts`, the SERP environment configuration standard); nothing is inferred
from the host. The value is read where it is used: at build time for the static pages, the
`next.config.ts` headers and redirects and `public/_headers`, and from the Worker's vars for
what renders on request, so each environment sets it in both (`wrangler.toml`,
[RELIABILITY.md](RELIABILITY.md#environments-and-hosts)). Anything but production (staging, a
local build or `next dev`):

- sends `X-Robots-Tag: noindex, nofollow` with every page and API response (`next.config.ts`)
  and every static file (`public/_headers`, which `scripts/generate-static-headers.ts` writes
  for each build from `src/lib/http/securityHeaders.ts`);
- answers `/robots.txt` with `Disallow: /` and no sitemap (`src/app/robots.ts`; production
  allows crawling and lists `https://serplists.com/sitemap.xml`);
- loads no Google Tag Manager (the root layout renders its bootstrap only on production).

Share pages are noindex on every environment. `tests/unit/seo/siteEnvIndexing.test.ts` checks
both sides, and `scripts/check-site-standards.mjs` checks a running site.

- Static pages export `metadata` (`/templates/`, `/categories/`, the 404 page).
- Dynamic public pages look their subject up in `generateMetadata`, the way the page itself
  finds it (`src/server/pageMeta/`):
  - a template page (`/profile/<user>/<slug>/`): a bundled library template, or one D1 row
    (`functions/seo/public-template-lookup.ts`), cached in the data center for 5 minutes;
  - a profile: the profile and its public templates through the API router in the same
    Worker (`src/server/api.ts`), cached for 5 minutes;
  - a category: the public catalog counted with the library's own functions, cached for 5
    minutes;
  - a share link: the run's title from one D1 row, never cached, and always noindex.
- The page text lives in `src/lib/publicPageMeta.ts`, which the views read too; change it
  there, so the page and its tags agree.

Every page shares one link-preview image, `public/og-default.png` (1200x630), named by
its absolute URL on `https://serplists.com` (`SITE_SOCIAL_IMAGE` in
`src/lib/publicPageMeta.ts`). Social sites ignore SVG images and relative URLs.

### Link previews

Link-preview crawlers (Slack, X, Facebook, LinkedIn, Discord, iMessage) do not run
JavaScript. Every page's HTML carries its own title, description, canonical URL and image,
so a shared link unfurls with that page's card, with no bot-only route and no Cloudflare
rewrite rule. A page whose metadata waits for a lookup may stream its tags to browsers after
the first bytes; for the crawlers Next.js lists as HTML-limited, it waits and puts them in
`<head>`.

### Missing pages

A path no route matches answers 404 with `src/app/not-found.tsx`, titled "Page not found",
with `noindex, follow` and no canonical URL. An unknown feature slug shows the same page.

A template or profile that does not exist answers with its own not-found message, and the
server's lookup gives it a not-found title and `noindex, nofollow`. Only a settled answer
counts: a lookup that failed keeps the site's defaults, and a page whose own load in the
browser fails (a network failure, 5xx or rate limit may be brief) shows a retry state; both
stay indexable. See `loadTemplateDetailData`
(`src/features/template-detail/loadTemplateDetail.ts`) and `loadUserProfile`
(`src/features/profile/loadUserProfile.ts`); only an API 404 (`isNotFoundError` in
`src/lib/api-errors.ts`) is settled.

When the browser learns that a page has nothing to index after the server rendered it (a
template made private within the 5-minute cache, a category with no public templates, a
category that does not exist), the view renders `NoIndexMeta`
(`src/components/seo/NoIndexMeta.tsx`); React hoists the tag into `<head>`, and search
engines follow the more restrictive rule. Render `NotFound` or `NoIndexMeta` only once a
lookup has settled, never while loading or after a failure.

## Verifying UI changes

Show the change working in the real app before opening a PR:
`pnpm run ui:snap -- <route> --login admin@test.com` for a screenshot and
accessibility tree, and the browser tests for flows
([development environment](design-docs/development-environment.md)).
