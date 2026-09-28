# Frontend

A React 18 single-page app in `src/`, built with Vite and TypeScript (`strict`).
Server state goes through TanStack Query, routing through React Router 6, and UI
through shadcn/ui on Tailwind ([DESIGN.md](DESIGN.md)). Path aliases: `@/*` maps to
`src/*`, `@functions/*` to `functions/*`.

## Structure

| Path | Role |
| --- | --- |
| `src/App.tsx`, `src/main.tsx` | Providers, routes, bootstrap |
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

Every page renders inside `RouteErrorBoundary` (`src/components/RouteErrorBoundary.tsx`):
`Layout` wraps its content, and routes outside `Layout` (the shared run page) wrap their
element. A page that throws while rendering shows a "Something went wrong" card with Try
again, Go back and a home link, the header and navigation keep working, and going to
another path clears it (the boundary resets on a pathname change, so healthy pages are
never remounted). The `ErrorBoundary` around the providers in `App.tsx` is the last
resort: its fallback uses plain links, and browser Back clears it.

`BrowserRouter` never resets the window's scroll, so `ScrollToTop`
(`src/components/routing/`) is mounted once inside the Router. When a navigation
changes the pathname, it scrolls to the URL's `#anchor` if that element exists and
otherwise to the top. Back and Forward (POP) keep the browser's own restoration, and
search-only changes, such as the library search rewriting `?search=`, never scroll.
Pages scroll the window, not an inner container; a shell that adds its own scroll
container must reset that element too.

## Data and state

- `src/lib/api.ts` handles the base URL, JSON, and structured errors, and sends the
  Better Auth session cookie with `credentials: 'include'`. It never stores tokens.
  Responses are not yet parsed with Zod (TD-2 in the
  [tech debt tracker](exec-plans/tech-debt-tracker.md)).
- Contexts and feature models own server state with React Query. Query keys include
  the user id and the active Ownership Context so Personal and Organization data
  never mix; switching context invalidates Template and Run queries. Billing keys
  include the user id; never show a Free or Pro label while status is loading.
  Build other private keys (invites, Organization members, Run Keys, archives) with
  `queryKeys` in `src/lib/queryKeys.ts`, and give those queries `enabled: Boolean(userId)`.
  The archive lists load only on `/dashboard/archive`; deleting a Template or Run
  marks them stale through `src/contexts/templateListCache.ts`.
- Sign-out and sign-in are SPA navigations, so the QueryClient outlives a session.
  When the signed-in user changes, `AuthProvider` removes every cached query no
  mounted page reads, except the public catalog. Never call `refetchQueries` without
  `type: 'active'`: an inactive key keeps the query function (and user) of the page
  that last read it. Invalidate instead.
- Template and run lists load on demand. `TemplatesProvider` wraps every route but
  never fetches them. A page that reads `templates` (the public catalog) calls
  `useTemplateLists({ catalog: true, workspace: false })`, one that reads `allTemplates`
  calls `useTemplateLists()`, and one that reads `runs` adds `runs: true`. The run page
  fetches its own run by id. A catalog miss reads every public Template from D1
  ([D1 cost](design-docs/d1-cost.md)), so pages that only need official templates use
  the bundled `repoTemplates`. The catalog's query key has no user id because the
  catalog is the same for everyone. In Personal, `allTemplates` merges the catalog with
  the user's own list; once that list has loaded it is the source of truth for the
  user's Personal templates, so a cached catalog copy it lacks (deleted, made private,
  or moved to an Organization) is dropped.
- Context values and helpers (`getTemplate`, the lists) keep their identity until their
  data changes, but never key a fetch on them: providers still re-render for unrelated
  reasons. Template detail pages load through `templateDetailLoader`, which fetches
  again only for a different template or viewer, shows the page spinner only for a
  different template, and takes newer versions from the list cache in place.
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
- Surface API failures by their structured code, not message text: `401` means sign
  in (keep the return path), `403 upgrade_required` and `403 limit_reached` mean a
  plan gate, `503 billing_unavailable` means checkout is down.
- Query functions reject when a request fails; never catch and return `[]`, which
  caches an empty list as fresh data and hides the error. Template and run list
  fetchers (`src/contexts/templateListFetchers.ts`) parse rows one at a time and skip a
  malformed row. `useTemplateLists()` returns `templatesError` and `runsError`; a page
  shows `ListLoadErrorState` (Retry, or Sign in on a `401`) instead of its empty state
  when a list failed and has no data.

## Template editor forms

- `src/lib/forms/templateEditorDetailsForm.ts` owns the top-level details contract;
  `src/lib/forms/templateEditorForm.ts` owns the combined editor contract, editor
  types with guaranteed ids, and nested field factories.
- Use React Hook Form field arrays for sections, items, content blocks, and
  sub-items instead of a second nested state tree.
- Omit an empty slug from create and update payloads rather than sending `""`.
- Keep category autocomplete triggers as real text inputs and use `onKeyDown` for
  tag entry.
- Preserve `seoTitle`, `seoDescription`, `slug`/`seoUrl`, and `rules` across save
  and reload.
- Adding a content type or editor tab: [template content types](design-docs/template-content-types.md).

## Rendering user content

Render Markdown with `react-markdown` with raw HTML disabled, and pass links and
media URLs through `safeUrl` (`src/lib/utils/safeUrl.ts`).

## Verifying UI changes

Show the change working in the real app before opening a PR:
`pnpm run ui:snap -- <route> --login admin@test.com` for a screenshot and
accessibility tree, and the browser tests for flows
([development environment](design-docs/development-environment.md)).
