# Features


## Auth And Account

- Better Auth is the canonical session layer for email sign-up, sign-in, sign-out, password changes, password reset, email verification, session lookup, and session revocation.
- Browser auth state uses Better Auth httpOnly cookies. The client does not store auth tokens.
- Protected routes preserve the originally requested destination, including its query string and hash, and return users there after sign-in. With no saved destination, sign-in goes to `/dashboard/settings`.
- Password strength rules are enforced for registration and password changes.
- `/dashboard/settings` is the canonical settings/account page.
- `/account` and `/dashboard/profile` redirect to `/dashboard/settings`, keeping the
  query string and hash (legacy redirects use `LegacyRedirect`).
- Public profiles remain available at `/profile/:username`.

## Dashboard Navigation

Canonical private routes:

- Templates: `/dashboard/templates`
- New template: `/dashboard/templates/new`
- Template detail: `/dashboard/templates/:id`
- Template editor: `/dashboard/templates/:id/edit`
- Import/export: `/dashboard/import-templates`
- Runs: `/dashboard/runs`
- Run detail: `/dashboard/runs/:id`
- Settings: `/dashboard/settings`

## Templates

- Users can create, edit, archive, restore, import, and export templates.
- Template detail pages render a read-only preview first. Editing happens on `/dashboard/templates/:id/edit`.
- Template content updates reconcile into matching active, private runs for the same Resource Owner. Stable section, item, and sub-item IDs preserve run completion and notes across renames and reordering; new work arrives incomplete, and retired work leaves readiness calculations while remaining in run history.
- Public templates can be shared at `/profile/{username}/{templateSlug}`. That is their only public URL, so the template library (`/templates`) and category pages list a public template only when its owner has a username, as the sitemaps do. The page also opens for other casings of the username and for the template id, but its canonical URL and `og:url` are always `https://serplists.com/profile/{username}/{templateSlug}` with the stored username casing and no query string, matching the sitemap entry.
- Links to a public template, a category page, `/categories` or `/templates` unfurl in Slack, X, Facebook, LinkedIn, Discord and iMessage with that page's own title and description (a template's SEO title and description when set) and the site's 1200x630 preview image (`public/og-default.png`). Those previews do not run JavaScript, so Pages Functions (`functions/seo/`) put the tags into the page's HTML. A private, deleted or unknown template, and a category that only database templates use, keep the generic site card. A template made private can keep its preview for up to 5 minutes (the lookup is edge-cached like the public catalog).
- The template library keeps its search, sort and category filters in the URL (`?search=`, `?sort=`, `?category=`), so links and Back/Forward change what it shows. A link to `/templates?category={slug}` with no other filter redirects to `/categories/{slug}`; the library's own filter edits never redirect.
- Each category a public template uses has a page at `/categories/{slug}`. The slug keeps letters and digits in any script (`日本語`, `русский`), drops accents on Latin letters (`Café Culture` is `cafe-culture`), and joins words with hyphens. The page and the category sitemap build it with the same function (`src/lib/categorySlug.ts`), and the page also opens for other letter cases and Unicode forms of the slug. An old ASCII-only slug (`caf-culture`) redirects to the current one. A category with no letters or digits (only emoji or punctuation) has no page: it is not listed as a category and shows as plain text on the template. Spellings with the same slug (`SEO` and `seo`, `Q&A` and `QA`) are one category: a template counts once toward it however often it lists it, so a category's count always equals the templates its page lists, and template imports and the editor keep only the first spelling (`uniqueCategoryNames` in `src/lib/categorySlug.ts`). The API still stores lists written directly to it as sent.
- Other Users can copy public templates into Personal or an authorized Organization when that ownership context's entitlement allows it.
- Template history is stored in `template_versions`; related actor/action history is stored in `audit_events`.

## Runs And Sharing

- Users can start checklist runs from templates.
- Run titles are limited to 160 characters, counted after trimming (`src/lib/schemas/nameLimits.ts`, matching the API). The Start Run name field and the rename boxes stop at the limit, and a longer title gets a clear message instead of the API's schema error. A Start Run that fails keeps the typed name for the retry.
- Runs store progress independently from templates. Progress counts every task and sub-task as one unit and is a whole percentage: 100% only when every unit is done, 0% only when none is, and anything in between rounds to 1-99% (so 199 of 200 is 99%, not 100%). The app and the API compute it with the same function (`src/lib/progress.ts`), and the dashboard's average progress follows the same rule.
- A task with sub-tasks is done when every sub-task in all of its Sub-tasks blocks is ticked, and unticking any of them reopens the task. Mark Complete ticks or unticks all of them. The web app and the agent API use the same rule.
- Run task counts ("2 of 5 tasks finished", the task list, "Task N of M", the runs list) count tasks only, never sub-tasks. The progress percentage and its bars follow the progress rule above, the same value the API stores as the run's progress.
- The run page lists every task and opens any of them directly: in a side column on wide screens, and from a Tasks button in the progress block on phones and narrower windows.
- Moving to another task on the run page (Mark Complete, Next, Previous, or a task list) scrolls back to that task's title when it is out of view, just below the sticky headers. Mark Complete, Next, Previous and the side task list also move focus to the title; the phone Tasks sheet returns focus to its Tasks button, as dialogs do. The rest of a double click that lands after that scroll is ignored. Opening a run, or saving a change to the task on screen, never moves the page or takes focus, and a field the user is typing in keeps its focus.
- The run page saves one change at a time. Each tick or untick sets the value the user clicked rather than flipping the saved one, so a click made while an earlier save is still in flight never reverses it, and a click that changes nothing sends no save. Completing a task moves on to the next unfinished task only if the completed task is still open when its save lands; a task the user opened while the save was in flight stays open.
- Run page controls that change what they do after a click (Next Task becomes the next task's Mark Complete, a completed task moves on to the next one, Rename becomes Save title) ignore the second click of a double click, and the completion prompt stays open through the rest of the double click that opened it. Saving an unchanged run title sends nothing.
- Ticking every task does not complete a run; the user confirms completion. While every task is done and the run is still in progress, the run page (private and shared) offers a Complete run action, so a dismissed prompt, a reload, or tasks ticked over MCP never leave a run stuck in progress. Active-run limits count runs until they are completed.
- A completed run is frozen on the run page and through its share link: its tasks and sub-tasks can no longer be ticked or unticked, so it never reads Completed with open tasks. Task notes stay editable. The web app has no Reopen action yet.
- The runs list (`/dashboard/runs`) links each run to its source Template and matches searches on that Template's title and owner. The source can be a public catalog Template or one of the viewer's Personal or active Organization Templates, public or private. Runs started from library Templates have no source link.
- Runs record both the template content version last reconciled and a run revision. API responses expose `is_stale` when the source checklist structure is newer; metadata-only template edits do not stale runs.
- Completed, archived, and publicly shared runs are frozen when a template changes. A completed private run can be explicitly reconciled and reopened with `POST /api/checklists/:id/revalidate`.
- Runs that predate stable identities are conservatively marked stale during migration. Their legacy IDs are backfilled deterministically, and their completion/notes remain intact until explicit reconciliation.
- Task notes belong to the run. Unsaved notes stay with their task while the user moves between tasks, are saved with Mark Complete (in the same save, also when another session or a sub-task already completed the task) and when the run is completed, and are never replaced by a save that returns while the user is still typing. Leaving the page with unsaved notes asks for confirmation.
- Run and template saves use optimistic revision/version markers. A stale editor receives `409 edit_conflict` instead of overwriting newer work.
- When another session (an Organization member, a shared link, a second tab, or an MCP agent) saved the run first, the run page (private and shared) loads the latest run, shows it, and retries the change once on it, so later saves never keep failing on an old revision. A tick or untick is retried as the value the user chose, so a tick made elsewhere is never undone. Notes, a title, or completion are not retried when someone else changed the notes being saved or the title; the page then shows the latest run, keeps the unsaved notes, and asks the user to check and try again.
- Run-level sharing creates public `/share/:token` links. The run page and the runs list show the created link in a dialog with a Copy button, so it is never lost when the browser refuses the automatic copy. The runs list shows a run as shared right away, so a stale shared run reads "Shared snapshot is out of date" and is not offered Revalidate.
- Guests can open shared runs without logging in and update checklist completion state.
- Shared runs do not expose owner-only title editing or destructive actions.
- Current run gating is plan-limit based through active-run limits.

## Personal And Organization Contexts

- Users always have a Personal context and can belong to Organizations.
- Organization-owned templates and runs are shared with active Organization members.
- Context switching is available from the dashboard shell and persists locally. This remembered selection is transitional convenience state; canonical Organization routes are tracked in issue #212.
- Organization roles:
  - `owner`: full Organization management and ownership transfer.
  - `admin`: manage Organization settings, members, and invites.
  - `editor`: edit Organization templates and start runs.
  - `runner`: start and execute runs.
  - `viewer`: read-only access.
- The UI offers only the actions the member's role allows in the Organization that owns the Template or run ([Organizations](../design-docs/organizations.md#ui-flow)).
- Organization management currently lives on `/dashboard/settings`.
- Organization names are limited to 120 characters, counted after trimming (`src/lib/schemas/nameLimits.ts`, matching the API). The Organization name fields stop at the limit, and a longer name gets a clear message instead of the API's schema error.
- Organization invites are link-based today. A link is shown once; managers can replace a lost one with **New link** on the pending invite, which stops the previous link from working. The legacy compatibility route `/team-invites/:token` and incoming invites on `/dashboard/settings` support acceptance. The link page shows the Organization, inviter, and role and waits for **Accept invite** or **Decline**; accepting does not switch the active context.
- Members other than the owner can leave an Organization from `/dashboard/settings`.
- Organization and Template changes are recorded in D1-backed audit/history tables.

## Entitlements

- Free users have limited personal templates and active runs.
- Pro Users have paid Personal limits.
- Organization entitlements apply only inside the selected Organization context.
- A Free User in a paid Organization can use paid capabilities for that Organization. Their Personal context remains Free.
- The API is the source of truth for entitlements. UI gating mirrors API behavior.

## Dev Personas

Local seeds create these users:

- `checklists@serp.co`
- `admin@test.com`
- `john@test.com`
- `jane@test.com`
- `bob@test.com`

Password for all seeded users: `password123`.

`admin@test.com` and `jane@test.com` are Pro dev personas through seeded Personal entitlement overrides; the API never grants a plan by email address. `john@test.com` and `bob@test.com` remain Free. Local seeds also include Organization Memberships, pending invites, Organization entitlement overrides, and audit rows. The underlying fixtures retain legacy `team` implementation names.

## Error Contract

- `401 Unauthorized`: the user must sign in.
- `403 upgrade_required`: the active Personal or Organization context needs a paid entitlement.
- `403 limit_reached`: the active Personal or Organization context hit a plan limit.
- `403 Forbidden`: the user is signed in but lacks the required role or permission.
- `503 billing_unavailable`: paid action cannot be started because billing config is unavailable.
- `503 auth_email_unavailable`: auth email delivery is unavailable for flows that require outbound email.
- `409 edit_conflict`: a template or run changed after the editor loaded it; refresh before retrying.

The client preserves API `status`, `code`, and `details` so UI behavior does not depend on string matching generic error messages.
