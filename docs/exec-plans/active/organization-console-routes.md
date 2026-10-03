# Organization Console Routes

- **Status:** active
- **Last updated:** 2026-10-02
- **Goal:** the authenticated URL decides the Personal or Organization context (issue
  #212), so an Organization's pages can be refreshed, shared and opened in any tab, and
  the remembered context only chooses where a bare `/dashboard/` lands. No migration.

## Current state (2026-10-02, before PR 1)

- Context came only from the tab's selection in `src/contexts/WorkspaceProvider.tsx`,
  seeded once per user from the remembered context (legacy key
  `serplists.activeWorkspaceId`). Every console URL sat under `/dashboard/` and showed
  whatever the tab had selected, so a copied link opened in the receiver's context.
- `/dashboard/` answered 307 with `/dashboard/templates/` (`next.config.ts`).
- Members open a private Organization Template from any context at
  `/dashboard/templates/:id/`; its Runs and copies go to its Organization
  (`src/lib/templateDestination.ts`).
- The API authorizes every Organization request by its legacy `teamId`. It stays the
  authority throughout; the routes only decide what the browser asks for.

## Routes

| Section | Personal | Organization |
| --- | --- | --- |
| Home (redirects to Templates) | `/dashboard/` | `/dashboard/organization/:organizationId/` |
| Templates | `/dashboard/templates/` | `/dashboard/organization/:organizationId/templates/` |
| New Template | `/dashboard/templates/new/` | `.../templates/new/` |
| Template detail | `/dashboard/templates/:templateId/` | `.../templates/:templateId/` |
| Template editor | `/dashboard/templates/:templateId/edit/` | `.../templates/:templateId/edit/` |
| Import Templates | `/dashboard/import-templates/` | `.../import-templates/` |
| Runs | `/dashboard/runs/` | `.../runs/` |
| Run | `/dashboard/runs/:runId/` | `.../runs/:runId/` |
| Archive | `/dashboard/archive/` | `.../archive/` |
| Settings | `/dashboard/settings/` | `.../settings/` |

`:organizationId` is the Organization's stable id (`teams.id`), never its name, slug or
Public Handle. `src/lib/consoleRoutes.ts` builds and parses every one of these paths.

## Steps

Each step is one PR and leaves `staging` working end to end on its own. The rule that
decides the split: a PR that makes a route decide the context also updates every link
and the switcher that send people there. Personal URLs therefore keep the tab's selected
context until PR 3, after PR 2 has moved every link onto the route of the context it
means.

### PR 1: Organization URLs (rollout steps 1, 2 and 4, and step 3 for Organization URLs)

- Route builders and a parser for both contexts in `src/lib/consoleRoutes.ts`
  (`routes.ts` re-exports the builders it already had), with tests.
- An ESLint convention refuses a hand-built `/dashboard/organization` path anywhere in
  `src/` or `functions/` outside `consoleRoutes.ts`.
- The Organization route tree under `src/app/(app)/dashboard/organization/[organizationId]/`:
  each page re-exports the Personal page, and the segment's layout
  (`OrganizationRouteGate`) shows a page only once the Organization is confirmed.
- `WorkspaceProvider` reads the Organization from the pathname: an Organization URL
  decides the context, the tab's selection follows a confirmed Organization URL, and the
  remembered context becomes that Organization.
- Switching context on a console page opens the same section in the chosen context
  (`useContextSwitch`). Every caller of `selectWorkspace` gets this: the switcher,
  Continue in Personal, Leave Organization, Create Organization, an accepted incoming
  invite, the Organization list on Settings and the editor's other-context draft.
- The sidebar (Templates, Runs, New Template, Import Templates, Archive, Settings) and the
  switcher's Settings link point at the current context's pages, and the sidebar
  highlights the section in either context.
- `/dashboard/organization/:organizationId/` answers 307 with that Organization's
  Templates.
- Other links still point at Personal URLs, which still show the tab's selection, so
  they keep working from inside an Organization.

### PR 2: links follow the context (rollout step 5)

- The context argument of every console builder becomes required, so no link defaults to
  Personal silently.
- Every link and navigation after an action passes the context it means: Template cards
  and rows, Run rows, the Template detail actions (edit, Start Run, duplicate), the editor
  (create, save, cancel, the read-only notice), the Run page's links, Archive, Import, the
  account menu, the invite page's "Switch to <Organization>", and the "Open Dashboard"
  links on public pages (the tab's current context).
- A link to a resource that has one owner uses that owner's context, not the page's: a
  Run row links to its Run's context, and a private Organization Template (pinned by
  `resolveTemplateDestinationTeamId`) links to its Organization.
- A browser test walks an Organization (list, detail, edit, run, archive, settings) and
  checks that no click leaves its URLs.
- #240's "View runs" on an Organization Template can link to that Organization's Runs
  (`buildConsoleRunsPath(organizationConsole(teamId))`) as soon as PR 1 lands, without
  waiting for this step.

### PR 3: Personal URLs mean Personal (rollout steps 3 and 6)

- A Personal console URL always shows Personal, whatever the tab or another tab
  remembered. Pages outside the console (the public Template page, the invite page) keep
  the tab's last context. Every context URL updates the remembered context.
- A bare `/dashboard/` opens the remembered context: a client page for the `dashboard`
  segment itself replaces the `next.config.ts` redirect, waits until
  the Organizations list confirms or rules out the remembered Organization, and replaces
  the URL with that context's Templates (Personal when it is ruled out; the Organizations
  error with Retry and Continue in Personal when the list fails). The legacy `/console`
  redirect and sign-in without a return path go there too.
- A Personal URL for a resource that belongs to an Organization the viewer is a member of
  (a private Organization Template, or an Organization Run) replaces itself with the
  Organization URL, and an Organization URL for another owner's Run or pinned Template
  replaces itself with that owner's URL (decision below; owner to confirm). Anyone else
  gets the API's 404, as now.
- `/dashboard/settings/` shows no Organization management; the Organization settings
  route does. Organization billing returns to the Organization's settings route
  (`functions/api/handlers/billing.ts` builds it with `consoleRoutes.ts`, which joins the
  modules the API may import).
- Rewrite the browser specs that relied on a Personal URL showing a remembered
  Organization (`workspace-teams-error`), and remove the transitional code (the tab
  selection that Personal URLs read).

## Decisions that need the owner

1. **A Personal URL for an Organization's Template or Run** (PR 3). Recommended: replace
   it with the Organization URL for members, so the URL, the sidebar and the switcher name
   the context the resource lives in. The alternative keeps such links working in
   Personal, with the template page saying where its Runs and copies go, as today. Either
   way no one sees anything new; the choice changes which context the page shows.
2. **Where #206 puts Account settings** (PR 3 and #206). Recommended: Account controls
   (profile, security, sessions, Personal Run Keys) on the Personal settings route beside
   Personal billing, which matches the glossary's Account; Organization settings only on
   the Organization's settings route; the account menu's Settings opens Personal settings
   from any context, which moves the tab to Personal, and the switcher's Settings opens
   the current context's settings. The alternative is a context-free `/dashboard/account/`
   page that keeps the tab's context. Neither needs the routes reshaped.
3. **The not-found copy for an Organization URL the user cannot open.** PR 1 shows the
   app's existing 404 ("That page does not exist"), which never says whether the
   Organization exists. An Organization-specific message would be new product wording and
   could confirm that an id exists; recommended to keep the generic page.

## Progress

- [x] Plan (this file), 2026-10-02.
- [x] PR 1: builders and parser, the ESLint convention, the Organization route tree and
  its gate, route-decided context for Organization URLs, the switcher and the sidebar.
- [ ] PR 2: links follow the context.
- [ ] PR 3: Personal URLs mean Personal, bare `/dashboard/`, resource redirects, settings
  and billing returns.

## Decision log

- 2026-10-02: Three PRs, not the issue's six steps one by one. Steps 3 (route decides the
  context) and 6 (remove hidden context) are only safe for Personal URLs once step 5 has
  moved every link; for Organization URLs nothing links there yet, so they can decide
  their context in PR 1, together with the switcher (step 4), which must navigate as soon
  as an Organization URL wins over the selection, or choosing Personal on one would do
  nothing.
- 2026-10-02: The Organization tree reuses the Personal pages by re-exporting each page
  module (`export { default } from '@/app/(app)/dashboard/runs/page'`), under one layout
  for the `[organizationId]` segment. The dynamic segments keep their names (`[id]`), so
  views that read `useParams().id` work unchanged, and Next.js still gives each Template
  and Run its own page instance. Rejected: one catch-all page (views would lose
  `params.id` and the per-record page instances), rewrites in `next.config.ts` (the
  pathname the app sees and the URL standard would disagree), and copied pages.
- 2026-10-02: `WorkspaceProvider` derives the context from the pathname with
  `parseConsoleRoute`, not from the layout's `params`: the sidebar and the switcher render
  above the segment's layout and must name the same context as the page.
- 2026-10-02: An Organization URL is confirmed against the Organizations list the
  provider already loads (`getRouteOrganizationStatus`): confirmed when listed (including
  an Organization the tab just created or joined), pending while the list loads, is
  paused, refetches or failed, and missing only once a settled list from the server leaves
  it out (unknown, archived, removed, or the legacy `personal` id). Pending shows a loading
  state and lists stay disabled; a failed list shows the existing Organizations error;
  missing shows the 404 page inside the console shell. The server still checks every
  request.
- 2026-10-02: A missing Organization renders the existing NotFound view from the layout,
  not Next.js `notFound()`, which this version documents for server code, while the
  context is only known in the browser once the list loads. Rejected: a silent redirect
  to Personal, which would show Personal data under a URL the user takes for the
  Organization's. On that page the shell falls back to the tab's own context, so the
  switcher and sidebar lead out.
- 2026-10-02: Until PR 3 a Personal URL still shows the tab's selection, and the tab's
  selection follows each confirmed Organization URL (once per arrival, so a switch to
  Personal is not undone while the Organization page is still on screen). A link that
  still points at a Personal URL from inside an Organization therefore stays in it.
- 2026-10-02: Switching context navigates to the equivalent section
  (`buildEquivalentConsolePath`): a Template or Run page maps to its list, since the
  record belongs to the context being left; the new-template page, Import, Archive and
  Settings keep their section. The selection changes only when the navigation goes ahead
  (`onLeave` on `useAppRouter`), so keeping unsaved work cancels the switch completely.
  Choosing the context already shown stays on the page, and outside the console (the
  public Template page, the invite page) the switch happens in place.
- 2026-10-02: The Organization home redirect lives in `next.config.ts` beside the
  Personal one, built from `ORGANIZATION_HOME_REDIRECT` in `consoleRoutes.ts`, which
  imports nothing so the config can load it.
- 2026-10-02: In PR 1 the builders' context argument defaults to Personal so existing
  call sites keep their links; PR 2 makes it required.
- 2026-10-02: The issue's `/templates/:id/edit` is the editor at
  `/dashboard/templates/:id/edit/` (`/templates/` is the public Template Library); its
  Organization form is `.../templates/:templateId/edit/` and follows the detail page's
  rules. Archive and Import Templates are context sections in both trees.
- 2026-10-02: Bare `/dashboard/` will be a client page (PR 3), because the remembered
  context lives in browser storage the server cannot read. Rejected: copying it into a
  cookie for a server redirect, which would add stored state sent with every request.
