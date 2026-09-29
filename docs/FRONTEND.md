# Frontend

A React 18 single-page app in `src/`, built with Vite and TypeScript (`strict`).
Server state goes through TanStack Query, routing through React Router 6, and UI
through shadcn/ui on Tailwind ([DESIGN.md](DESIGN.md)). Path aliases: `@/*` maps to
`src/*`, `@functions/*` to `functions/*`.

## Structure

| Path | Role |
| --- | --- |
| `src/App.tsx`, `src/appRoutes.tsx`, `src/main.tsx` | Providers and the data router, the route tree, bootstrap |
| `src/pages/` | Route screens: compose components and feature models |
| `src/components/` | Feature UI; `components/ui/` holds presentational primitives |
| `src/features/*/` | Headless feature models (`use*Model.ts`) and mappers from API shapes to domain types |
| `src/contexts/` | Auth, Ownership Context (legacy `WorkspaceContext`), Templates and Runs |
| `src/hooks/` | Shared hooks |
| `src/lib/api.ts` | The only HTTP client (transport) |
| `src/lib/schemas/`, `src/types/` | Zod schemas and domain types, shared with the API |

Enforced by `pnpm run deps:check` ([ARCHITECTURE.md](../ARCHITECTURE.md)): pages and
components never call `src/lib/api.ts` at runtime (put the call in a feature model
or context), `components/ui/` stays presentational, and every module must be
reachable from `src/main.tsx`. Remaining legacy call sites are tracked in the
[UI decoupling plan](exec-plans/active/ui-decoupling.md).

Canonical private routes live under `/dashboard/*`; the full route list is in
[system overview](design-docs/system-overview.md#routes).

Routes render through a data router (`createBrowserRouter` and `RouterProvider`), not
`BrowserRouter`, so a page can block navigation with `useBlocker`. The route tree lives
in `src/appRoutes.tsx` under a root `AppShell` route. Unit tests render routes with
`tests/fixtures/renderDataRoutes.tsx` (a static data router).

Every page renders inside `RouteErrorBoundary` (`src/components/RouteErrorBoundary.tsx`):
`Layout` wraps its content, and routes outside `Layout` (the shared run page) wrap their
element. A page that throws while rendering shows a "Something went wrong" card with Try
again, Go back and a home link, the header and navigation keep working, and going to
another path clears it (the boundary resets on a pathname change, so healthy pages are
never remounted). The `ErrorBoundary` around the providers in `App.tsx` is the last
resort: its fallback uses plain links, and browser Back clears it.

The router's history never resets the window's scroll, so `ScrollToTop`
(`src/components/routing/`) is mounted once in `AppShell`, inside the router. When a
navigation changes the pathname, it scrolls to the URL's `#anchor` if that element
exists and otherwise to the top. Back and Forward (POP) keep the browser's own
restoration, and search-only changes, such as the library search rewriting `?search=`,
never scroll. Pages scroll the window, not an inner container; a shell that adds its own
scroll container must reset that element too.

## Unsaved changes

A page that holds unsaved edits must ask before they are lost, whichever way the user
leaves. The template editor (`useTemplateEditorLeaveGuard`) is the model:

- `useBlocker` covers every route change: sidebar, header, account menu, in-page
  links, and browser Back/Forward. It asks only when the pathname changes.
- Actions that leave the page without a navigation it can block first, such as Sign
  out (which unmounts the page), go through `src/lib/navigation/leaveGuard.ts`; the
  page registers with `registerLeaveGuard`. Sign out uses `leaveAfterConfirmed`: it
  asks first, and if the server refuses the sign-out the user stays and the page asks
  again next time.
- `beforeunload` covers reloads, tab closes, and external links.
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
  saved, or a checkout or sign-in redirect after the draft was kept) is allowed
  without asking. Back from checkout can restore the page from the back/forward
  cache with that exit still allowed, so the guard re-arms on that restore: edits
  made after coming back are not in the kept draft.
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
  The archive lists load only on `/dashboard/archive`; deleting a Template or Run
  marks them stale through `src/contexts/templateListCache.ts`.
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
  reasons.
- Template detail pages never show a copy from a list: a list is refetched after an
  edit only while a page observes it, so an unobserved copy can be arbitrarily old. The
  public template page loads its template from the API on every visit (bundled library
  templates excepted). The private detail page loads its template by id (slug as a
  fallback) with a query keyed under `['templates']`, so every template invalidation
  (editor saves, visibility, Share, copies, archive, context switches) refetches it
  while it is open and the next write sends the version the server holds. Both loads
  are keyed only on the template (and, for the private page, the viewer), so an
  unrelated re-render never reloads them. A background refetch, including the reload
  after a `409` edit conflict on Share or the visibility switch, swaps the template in
  place without the page spinner, and a visibility change keeps the version its `PUT`
  answer returns.
- `templates` always includes the bundled `repoTemplates`, so a non-empty list does not
  mean the catalog loaded. Discovery pages read `catalogPending` and `catalogError` from
  `useTemplateLists` (`loading`, `catalogError`, and `retryCatalog` in
  `useTemplateLibrary`): show a skeleton while pending, a retry state on error, and a
  404 or "no templates" message only after the catalog loaded. A failed catalog request
  stays an error; it is never cached as an empty catalog.
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
  only if they are still on the page that started the action: React Router still runs
  a `navigate()` from a page the user has left. Call `beginVisit()` from
  `usePageVisit` (`src/hooks/usePageVisit.ts`) when the action starts and check
  `visit.isCurrent()` after the request; it is false once the page unmounts or its
  location changes (Back, a link, another id on the same page). The request's own
  result stands: cache updates still happen. The template pages route Start Run,
  Copy/Save and Share results through `followTemplateActionResult`; My Templates
  passes the visit to `reportDashboardTemplateRunFailure`, and template import and
  export pass `isCurrent` to `handleAccessFailure`. A plain error is still shown
  after the user has left. `tests/unit/pages/navigateAfterAwait.test.ts` scans `src/`
  and fails when an async handler navigates, signs in or starts checkout after an
  await outside a visit gate (an `if (visit.isCurrent())` branch, an early return once
  the visit has ended, a callback given to one of the visit helpers, or a call that is
  passed the visit), unless it is listed as ungated on purpose. It also fails when a
  file uses a sign-in or checkout helper without `usePageVisit()`.
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
  (`TemplateEditorForm` in `src/pages/TemplateEditor.tsx`), so nothing mounts against
  the blank defaults. UI state about sections, such as which ones the outline has
  collapsed, is keyed by section id and never seeded from the sections present at
  mount: a Clipy draft, a restored draft, or a save replaces the sections with
  `reset()`.
- Stored content is not validated on import (TD-3), so `buildTemplateEditorFormValues`
  coerces it into values the editor schema accepts: numeric ids and values become
  strings, an unknown block type becomes a text block that keeps its value, invalid
  file details are dropped, and every content block gets its own id (uploads find
  their block by id). A loaded template can always be saved. Save validation errors
  inside the outline name the section, task, and content block.
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
  normalized (`slugifyTemplateSlug`) when the field loses focus and on save.
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
  and from the billing section, and cleared only when a save succeeds (even one that
  finishes after the user left the editor) or the user discards it.
- Adding a content type or editor tab: [template content types](design-docs/template-content-types.md).

## Rendering user content

Render Markdown with `MarkdownBlock` (`src/components/shared/MarkdownBlock.tsx`), the
only module that imports `react-markdown`. It disables raw HTML and passes links through
`safeUrl` (`src/lib/utils/safeUrl.ts`); pass other media URLs through `safeUrl` too.

## Page titles and meta tags

Pages set their title and social tags with `SEOHead`
(`src/components/shared/SEOHead.tsx`), which titles them "Page | SERP Lists" through
`buildPageTitle` in `src/lib/brand.ts`. `App.tsx` wraps everything in
`DocumentHeadProvider`, whose default title is the brand alone, so a page without
`SEOHead` never keeps the previous page's title. Do not add a `titleTemplate`: `SEOHead`
already adds the suffix.

`index.html` keeps a static description, Open Graph and Twitter tags for crawlers that do
not run JavaScript. Each carries `data-rh="true"`, so react-helmet-async owns it: a page's
`SEOHead` replaces it by name or property instead of adding a second copy. The same tags
are the defaults in `DocumentHeadProvider`, which puts them back when a page without
`SEOHead` opens. Keep the two identical, and give any new static SEO tag `data-rh` and a
matching default (`tests/unit/components/documentHeadMeta.test.tsx` checks both). The
viewport and charset tags are global: they stay in `index.html` only, without `data-rh`.

Every page shares one link-preview image, `public/og-default.png` (1200x630), named by
its absolute URL on `https://serplists.com` (`SITE_SOCIAL_IMAGE` in
`src/lib/publicPageMeta.ts`). Social sites ignore SVG images and relative URLs. Link
previews do not run JavaScript either, so for public template, category, `/categories` and
`/templates` pages the Pages Functions in `functions/seo/` serve `index.html` with the page's
title, description, `og:type`, canonical link and `og:url` already filled in (with
`data-rh`, so `SEOHead` takes them over). The pages and those functions read their text
from `src/lib/publicPageMeta.ts`; change it there, not in the page, so the preview and the
page agree. A new public route with its own `SEOHead` text needs a matching function.

Cloudflare Pages serves `index.html` with a 200 for every unknown path, so the 404 page
(`src/pages/NotFound.tsx`) marks itself `noindex` and declares no canonical URL. Render
`NotFound` only once a lookup has settled: a page whose data is still loading, or failed
to load, shows a loading or retry state instead, so a real page never sends `noindex`.
Never render `NotFound` next to an `SEOHead`. Do not add a top-level `404.html`; it turns
off the single-page app fallback.

Pages with their own not-found message (a public template or profile) render `SEOHead`
with `robots="noindex, nofollow"` and a not-found title in that state. Only an API 404
(`isNotFoundError` in `src/lib/api-errors.ts`) counts as settled. A network failure, 5xx
or rate limit may be transient, so it shows a retry state without `noindex`; see
`loadTemplateDetailData` (`src/features/template-detail/loadTemplateDetail.ts`) and
`loadUserProfile` (`src/features/profile/loadUserProfile.ts`). `NotFoundHead`
(`src/components/shared/NotFoundHead.tsx`) is the 404 page's head.

## Verifying UI changes

Show the change working in the real app before opening a PR:
`pnpm run ui:snap -- <route> --login admin@test.com` for a screenshot and
accessibility tree, and the browser tests for flows
([development environment](design-docs/development-environment.md)).
