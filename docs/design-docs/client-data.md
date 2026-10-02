# Client data

How the app's screens call the API, cache what they read, and refresh it after a write. The
rules every screen follows (which lists a page loads, list states, feedback after a write) are
in [FRONTEND.md](../FRONTEND.md#data-and-state); the API's base URL and the tables behind it
are in [data persistence](data-persistence.md#api-access).

## The API client

`api` (`src/lib/api.ts`) joins the endpoint groups in `src/lib/api/` (templates, runs, teams,
account) into one object. Each call goes through `apiRequest`, or `apiFormDataRequest` for an
upload (`src/lib/api/request.ts`), which sends the Better Auth session cookie
(`credentials: 'include'`) and turns every answer that is not `2xx` into an `ApiError`. A `401`
is also reported to `src/lib/unauthorizedResponses.ts`, which re-checks the session
([authentication](authentication.md#contract)).

Every call passes the Zod schema of what its endpoint answers, and `apiRequest` returns the
schema's output. The schemas live in `src/lib/schemas/`: `apiTemplates.ts`, `apiRuns.ts`,
`historyResponses.ts`, `teamResponses.ts`, `accountResponses.ts`, `teamInvite.ts`,
`agentMcpConnection.ts` and `apiResponses.ts` (success, URL and list helpers), with the
template save's in `src/lib/templateUpdateResult.ts` and the import summary's in
`src/lib/templates/templateImportSummary.ts`.
- The client's response types are `z.infer` of these schemas, not separate interfaces, and a
  schema strips the fields it does not name. So a field a page reads but the schema lacks is
  a type error, never a value that silently disappears.
- A body that fails its schema, or is not JSON, becomes the usual `ApiError`: the response's
  status, code `unreadable_response`, the message "Unexpected response from the server",
  the Zod issues in `details` and the `ZodError` as its `cause` (`isUnreadableResponseError`
  in `src/lib/api-errors.ts`). A template save reports it as `TEMPLATE_UPDATE_RESPONSE_ERROR`
  instead, which asks for a reload, since the save itself went through.
- The Template and run lists leave out a row their schema cannot read (`readableRowsOf`), as
  the lists already left out a Template they could not map, rather than failing the whole
  list.
- Values the database stores as free text read the way the server normalizes them: an
  unknown Organization role as `viewer`, an unknown member status as `disabled`. Older
  shapes the mappers still accept (a Template's `items` or string `tags`, `is_public` as `1`)
  are optional fields of the schemas.
- The server-side page loaders parse their API reads the same way (`fetchApiJson` in
  `src/server/api.ts`). `getAuthStatus` (`src/lib/auth-client.ts`) parses `/api/auth/status`
  with `authStatusSchema` (`src/lib/schemas/authStatus.ts`), the type the server's
  `getAuthEmailPolicy` returns.

Every mapper from an API template row to a `ChecklistTemplate` reads its Organization with
`readApiTemplateTeamId` (`src/lib/templates/apiTemplateOwner.ts`), which follows the server's
rule (a row is the Organization's only with a `team_id`, and with `owner_type` `team` when the
row has an owner type), so permission checks that compare `teamId` agree wherever a template
was loaded from. Public catalog rows never name an Organization
([SECURITY.md](../SECURITY.md#model)), so `isPersonalTemplateOf`
(`src/lib/templates/templateOwnership.ts`) also checks the owner type to tell a user's
Organization template apart from their Personal ones.

History requests ask for what their screen shows, since each entry is an audit row read with
its user: the run and Template Changelogs ask for `HISTORY_DISPLAY_LIMIT` entries
(`src/lib/history.ts`), never the API's default of 50, and Organization activity asks for the
10 its settings page shows.

## Error types

An `ApiError` (`src/lib/api-errors.ts`) carries the HTTP `status` and the body's `code` and
`details`; its message is the body's `error`, or `HTTP <status>` when the body has none. Pages
decide by status and code, never by message text:

| Predicate | Answer | Meaning |
| --- | --- | --- |
| `isNotFoundError` | `404` | Settled: the resource is missing, deleted, or private to someone else. Anything else (a network failure, a `5xx`, a `429`) may pass, so the page offers a retry, never "not found". |
| `isAuthRequiredError` | `401` | No valid session: sign in and come back to the page. |
| `isUpgradeRequiredError` | `403 upgrade_required`, or `403 limit_reached` for a Personal limit | A plan gate that Personal checkout can lift. `details.context` names whose limit was reached. A Personal Pro plan never lifts an Organization's limit, so an Organization limit is a plain error with the server's message, and an answer without a context (from an API older than contexts) counts as Personal. |
| `isEditConflictError` | `409 edit_conflict` | The template or run changed after the page loaded it. |
| `isUnreadableResponseError` | `unreadable_response`, with the answer's status | The body was not what the endpoint's schema describes ([above](#the-api-client)). A plain error to the page. |
| `isStaleRecordError` (`src/lib/editConflicts.ts`) | `404`, `409 edit_conflict`, `409 shared_run_conflict` | The page's cached copy is out of date ([below](#stale-copies-and-conflicts)). |
| `isBillingUnavailableError` | `billing_unavailable` | Checkout cannot start. |
| `isSubscriptionNeedsAttentionError`, `isOpenSubscriptionConflictError`, `isBillingCustomerMissingError` | `409` from checkout or the Customer Portal | The stored plan or Stripe account differs from what the page shows ([billing](billing.md#app-endpoints)). |

`getAccessFailure` reduces an error to the kind a page acts on: `auth_required`,
`upgrade_required`, `billing_unavailable`, `subscription_needs_attention`, or a plain `error`
with the server's message or the page's fallback. `handleAccessFailure`
(`src/lib/access-flow.ts`) then signs in, starts checkout or shows the message.

## Cache keys

TanStack Query caches every API read. A key starts with its kind, and each kind is built in
one module:

- **Template and run lists** (`src/contexts/TemplatesContext.tsx`) are keyed by user and
  Ownership Context, so Personal and Organization data never mix. The public catalog,
  `['templates', 'catalog']`, has no user: it is the same for every visitor. Organization lists
  are fetched by the legacy-named `WorkspaceContext` and keyed by the current user.
- **Changelogs** (`queryKeys` in `src/lib/queryCache.ts`): a run's is
  `['checklist-run-history', runId]` and a Template's
  `['templates', 'history', templateId, user, context]`. `everyTemplateHistory` is the prefix
  without the last two, so a save refreshes every cached Changelog of the Template, whatever
  user or Organization loaded it.
- **A private template detail page** (`queryKeys.templateDetail` in `src/lib/queryCache.ts`, next
  to `isTemplateDetailOf`, which reads the key by position) is
  `['templates', 'detail', <route identifier>, user]`, and holds `null` once the server said
  the template is gone. The route identifier can be a slug, so `isTemplateDetailOf` also
  matches an entry by the id of the template it loaded. The key names no Ownership Context:
  `GET /api/templates/:id` answers the same in every context, and a context switch marks it
  stale with the lists. It is fetched again when invalidated, not when the tab regains focus,
  which would reload the page under an open dialog for nothing, and a failed load is not
  retried: the load already tells a missing template from a failure, and the page offers Try
  again.
- **One user's private data** (`queryKeys` in `src/lib/queryKeys.ts`): invites, Organization
  members and activity, Run Keys, and the archive lists. The user id (`signed-out` when there
  is none) comes second, so two people who sign in on the same tab never read each other's
  entries. `queryKindPrefix` matches a kind for every user and context, for marking it stale.
- **Billing status** (`getBillingStatusQueryKey` in `src/lib/billing.ts`) is
  `['billing', 'status', user, context]`, and `BILLING_STATUS_QUERY_PREFIX` matches every
  user's and context's. A session change never reuses another user's plan, and the UI shows a
  neutral loading state until the current user's plan is known.

A Template list invalidation reaches every key under `['templates']`: the lists, the detail
pages and the Template Changelogs. Share, the visibility switch and a restore therefore
refresh an open detail page and its Changelog too; a context switch and an editor save only
mark them stale, so they load when a page next shows them.

## Template and run lists

Which page loads which list, and how pages read them, is in
[FRONTEND.md](../FRONTEND.md#data-and-state). `TemplatesProvider`
(`src/contexts/TemplatesProvider.tsx`) builds the list queries (`buildTemplateListQueries` in
`src/contexts/TemplatesContext.tsx`, beside the hooks) and
watches them without fetching; a page's `useTemplateLists` turns on the lists it asked for.
Its loading and error flags come from that page's own observers
(`resolveTemplateListObservers` and `listLoadError` in `src/contexts/templateListObservers.ts`),
since the provider's observers hear of a fetch a render later. `catalogPending` covers the
wait for the session and the first request, never a background refetch of a cached catalog.

- Lists stay fresh for 5 minutes. A failed load is retried once, like the app's default,
  unless the server refused it with a `4xx` (signed out, no access, not found, rate
  limited), which repeating at once cannot fix (`shouldRetryListFetch` in
  `src/contexts/templateListFetchers.ts`).
- The catalog's 5 minutes match the edge cache's. Deleting a Template drops it from the
  cached catalog, which then stays fresh (`refreshAfterTemplateDelete` in
  `src/contexts/templateListCache.ts`): a refetch before the edge copy expires could list it
  again. The other lists of every user and context are marked stale, since the Template may
  not belong to the active one.
- A Template save marks the Template lists stale and refreshes its Changelogs, and refreshes
  the run lists only when it changed the checklist structure (`describeTemplateUpdate`):
  only then were the Template's in-progress runs reconciled.
- A run whose content cannot be read stays listed with no tasks, so it can still be deleted
  (`mapChecklistRuns`); a template that cannot be read is left out of its list.

## Refreshing after a write

- **Mark stale; refetch only what a page shows.** `invalidateQueries` refetches the queries a
  page observes and marks the rest stale, to load when a page reads them. A query no page
  observes keeps the query function, and so the user, of the page that last read it, so
  refetching it by force after a sign-out and a sign-in in the same tab would load the new
  session's data into the old user's key.
- **Reloading one query.** `reloadQuery` (`src/lib/queryReload.ts`) cancels a fetch in flight,
  which read the server before the write (the query goes back to its state before that
  fetch), applies the caller's update so the written item shows at once, then invalidates the
  query. The Organization settings lists (members, activity, pending and incoming invites)
  also cancel first, then refetch only the queries a page observes (`reloadObservedQueries`
  in `src/features/teams/`, and `cancelThenRefetch` in `useTeamSettingsQueries`).
- **Changelogs.** They stay fresh for the app's default 60 seconds, but every save writes an
  audit event (and a Template save a version), so saves refresh them explicitly
  (`refreshRunHistory` and `refreshTemplateHistory`, called by the list refreshes in
  `src/contexts/templateListCache.ts`). The run page refreshes its run's Changelog once its
  save queue is idle after a save, not once per click (each refetch reads D1). Revalidating a
  run, and Share or Stop sharing on the runs list, refresh it too, and saving a Template in the
  editor refreshes every cached Changelog of that Template.
- **Archiving a Template** marks its detail entries and Changelogs stale without refetching
  them (`markArchivedTemplateStale`). The detail page can still be open while the delete
  settles, and a refetch (or removing a query a page observes, which fetches it again) would
  cache the `404` as "not found" for the next visit, even after a restore.
- **Restoring** a Template or Run (`restoreArchiveItem` in
  `src/features/archive/archiveRecovery.ts`) refreshes the Template and Run lists it returns
  to and the archive list it left, keyed by the user and context the restore started in, so a
  context switch while it runs still refreshes the right archive.
- **Sharing a run**, from the runs list or the run page, marks it public in every cached runs
  list (Personal and each Organization) as soon as the API returns, before the link is
  copied, then reloads the lists (`markRunShared`). A shared run cannot be revalidated, so its
  row stops offering Revalidate. The run page's Share calls `markRunShared` alone, since the
  run page's saver refreshes its open Changelog; the runs list uses `refreshAfterRunShared`,
  which refreshes the Changelog too.
- **A change of user** (a sign-out, or a sign-in as someone else in the same tab) makes
  `AuthProvider` remove every cached query no mounted page reads, except the public catalog
  (`removeSignedOutUserQueries`), so nothing the previous user loaded is shown to or
  refetched for the next one. It runs once the app has rendered for the new user, whose pages
  then observe their own keys, so every unobserved entry was the previous user's: it is an
  effect of `AuthProvider` (`useRemovePreviousUserQueries`), which React runs after the
  effects of the pages inside it, so it must stay in a provider above every page. Removing a
  query also cancels its fetch, so a late answer for the previous user cannot write its data
  back. The first session restore after a page load is not a change of user
  (`isUserSwitch`): nothing private is cached yet.

## Stale copies and conflicts

Saves send the version or revision of the copy the page loaded (`expected_version`,
`expected_revision`), so the server refuses a write made on an old copy. Three answers mean
the page's cached copy is out of date (`isStaleRecordError`): `409 edit_conflict` (the record
changed elsewhere), `409 shared_run_conflict` (the run was made public elsewhere), and `404`
(it was archived). The page refreshes its cache before it shows the error, so the next attempt
uses the current version or revision; without the refresh every retry would send the same
stale value and fail the same way. Its message says the list was refreshed or the template
reloaded (`getRevalidateRunErrorMessage`, `getTemplateChangeErrorMessage`), since the
server's "Refresh before ..." text no longer applies.

- A refused revalidate reloads the runs lists. A `404 source_template_unavailable` means the
  run is still there but its template was archived, made private, or is not usable in the
  run's context, so the reloaded row stops offering Revalidate.
- A `404` on Archive, Share or Stop sharing for a run, or on Archive or Start Run for a
  template, means it was archived elsewhere while the cached list still showed it: the Run or
  Template lists reload before the error shows (`refreshRunsAfterConflict`,
  `refreshTemplatesAfterConflict` in `src/contexts/templateListCache.ts`), and the cached
  public catalog drops the template instead of refetching its edge copy.
- A template save's answer (`templateUpdateResultSchema`, which `api.updateTemplate` parses
  it with) carries the version and slug it stored. The next save sends that version, never a
  local `+1`: a save that changes nothing keeps it. An answer without a version is an error
  that asks for a reload before saving again, rather than a guessed version.

## Loading states

`getListQueryStatus` (`src/lib/queryState.ts`) is what `QueryListState` renders: `loading`
only while a first load is in flight, `error` when it failed with nothing loaded, `empty` or
`ready` once a list has loaded, and `idle` for a disabled query or a cancelled first load. A
failed background refresh keeps the loaded list (`hasListRefreshError` then says so).

Billing status reads the same way (`resolveBillingStatus` in `src/lib/billing.ts`). A plan is
`known` only once the server has answered, and stays known when a later refresh fails; a
failed or pending read is never taken as Free, so no upgrade prompt or checkout appears until
the server has said the plan is Free; and a disabled query (signed out) is `idle`, not
loading. A failed read is retried twice after a network failure or a `5xx`, never after a
`4xx` such as a `401` or a removed Organization's `404` (`shouldRetryBillingStatus`).
