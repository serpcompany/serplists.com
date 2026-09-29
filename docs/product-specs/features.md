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
- Archive: `/dashboard/archive`, linked from the console sidebar and mobile menu

## Templates

- Users can create, edit, archive, restore, import, and export templates.
- Deleting a template or run archives it (the API sets `deleted_at`). `/dashboard/archive` lists the active context's archived templates and runs and restores them. Restoring respects plan limits and Organization roles, and shows the API's reason when it refuses.
- Template detail pages render a read-only preview first. Editing happens on `/dashboard/templates/:id/edit`. The editor opens its form only for someone the API lets save the template: an Organization's Template for an owner, admin, or editor of that Organization (from any context), a Personal Template for its owner. Anyone else who opens an edit link (a runner or viewer, or another user's public template) sees a read-only notice with a link to the template, and `/dashboard/templates/new` shows the same kind of notice to a role that cannot add Templates to the active Organization. The editor waits for the user's Organizations to load before deciding, and a form that has opened stays open (a later role change is still refused by the save).
- In the editor, sections, tasks and a task's content blocks reorder by dragging their handle, or with the Up and Down arrow keys on the focused handle. Blocks keep their ids when they move, and runs and public pages show blocks in the saved order.
- Template detail, public template, and public profile pages say a template or user was not found only when the API answers 404 (or the template is not public under that owner). A server or network failure shows "Unable to load" with a Try again button instead. Because every route is served with HTTP 200, the public template and public profile not-found states set `robots` to `noindex, nofollow` so a removed, private or renamed page drops out of search; the "Unable to load" state does not, so a brief outage never deindexes a live page.
- Template titles are limited to 160 characters. Duplicate names the copy "<title> Copy"; when that would be too long, the title is shortened so the copy still fits.
- Export JSON on the template detail page downloads that template as a portable template pack, the format Import Templates accepts, named after its slug (or its id when it has none). Like Import Templates, it needs a paid plan in the active ownership context; otherwise the item reads "Upgrade to export".
- Template content updates reconcile into matching active, private runs for the same Resource Owner. Stable section, item, and sub-item IDs preserve run completion and notes across renames and reordering, also when a task moves to another section or a Sub-task to another task (ids are unique across the Template; a legacy run that repeats an id in several sections matches each copy only in its own section); new work arrives incomplete, and retired work leaves readiness calculations while remaining in run history. Retired sections, tasks, and Sub-tasks keep their completion and notes and appear read-only under "Removed from Template" on the run page and as `retiredItems` in the Run Key `get_run` tool; shared run links leave them out. A `get_run` call scoped to a `sectionId` or `taskId` returns only that section's or task's retired work, retired ids can be read the same way, and a `result_too_large` error lists retired ids beside the live ones, so a run with large retired work can still be read in parts. When a later Template version brings a retired id back, its run state comes back with it. Each reconcile that changes a run adds an "Updated from Template" entry to the run's Changelog naming the retired work (never its notes); Revalidate records the same. A task with Sub-tasks is complete exactly when all of them are (the run page, Run Keys, reconciliation, and revalidation apply the same rule), so a new Sub-task reopens a completed task and removing its last unfinished Sub-task completes it; a task left without Sub-tasks keeps its state. The completion prompt also waits for every Sub-task.
- On the template detail page, an Organization's Template is managed by the viewer's Organization Role while that Organization is active, never by who created it: owners, admins, and editors get Share, Edit, Duplicate, Export, Archive, and the visibility switch; runners and viewers, including a Creator who was demoted, get read-only controls. From any other context it is read-only. A Personal Template is managed only by its owner. Share links for Organization Templates still use the Creator's username until Organization Public Profiles exist.
- Public templates can be shared at `/profile/{username}/{templateSlug}`. That is their only public URL, so the template library (`/templates`) and category pages list a public template only when its owner has a username, as the sitemaps do. The page also opens for other casings of the username and for the template id (a slug is never a UUID: a save that asks for one gets a short suffix, and an older Template that already has one still opens at it), but its canonical URL and `og:url` are always `https://serplists.com/profile/{username}/{templateSlug}` with the stored username casing and no query string, matching the sitemap entry. Share on the template detail page makes a private template public only after that URL resolves; an owner without a username is asked to set one and the template stays private. The visibility switch changes only visibility; the badge and switch always show what the server holds after either one, and neither can start while the other is saving. Template and Organization slugs come from one rule (`src/lib/utils/slug.ts`, used by the page and the API): accented letters fold to their base letter (`Café` becomes `cafe`, `Straße` becomes `strasse`), other characters are dropped, and a title with no Latin letters or digits falls back to `template` (or `team-<id>` for an Organization).
- The editor's Search & SEO panel previews that URL: the username is the template's creator (also for an Organization's template), and the slug is the one a save stores (a blank slug keeps the saved one, or for a new template comes from its name). It says when the creator has no username or the template is private, and notes that a slug another template already uses gets a short suffix.
- Links to a public template, a category page, `/categories` or `/templates` unfurl in Slack, X, Facebook, LinkedIn, Discord and iMessage with that page's own title and description (a template's SEO title and description when set) and the site's 1200x630 preview image (`public/og-default.png`). Those previews do not run JavaScript, so Pages Functions (`functions/seo/`) put the tags into the page's HTML. A private, deleted or unknown template, and a category that only database templates use, keep the generic site card. A template made private can keep its preview for up to 5 minutes (the lookup is edge-cached like the public catalog).
- The template library keeps its search, sort and category filters in the URL (`?search=`, `?sort=`, `?category=`), so links and Back/Forward change what it shows. A link to `/templates?category={slug}` with no other filter redirects to `/categories/{slug}`; the library's own filter edits never redirect.
- Each category a public template uses has a page at `/categories/{slug}`. The slug keeps letters and digits in any script (`日本語`, `русский`), drops accents on Latin letters and folds the others the way template slugs do (`Café Culture` is `cafe-culture`, `Straße` is `strasse`), and joins words with hyphens. The page and the category sitemap build it with the same function (`src/lib/categorySlug.ts`), and the page also opens for other letter cases and Unicode forms of the slug. An old ASCII-only slug (`caf-culture`) redirects to the current one. A category with no letters or digits (only emoji or punctuation) has no page: it is not listed as a category and shows as plain text on the template. Spellings with the same slug (`SEO` and `seo`, `Q&A` and `QA`) are one category: a template counts once toward it however often it lists it, so a category's count always equals the templates its page lists, and template imports and the editor keep only the first spelling (`uniqueCategoryNames` in `src/lib/categorySlug.ts`). The API still stores lists written directly to it as sent.
- Other Users can copy public templates into Personal or an authorized Organization when that ownership context's entitlement allows it. Copying into Personal is a Pro feature: the browser checks the Personal plan first, and the API returns `403 upgrade_required` on Free. In an Organization the API decides: a Free Organization may copy within its Template limit, the template detail page labels the button "Copy to Organization", and roles that cannot add Templates to the Organization do not see it. The template detail page offers no copy on a private template (such as a private Organization Template viewed from Personal or by a viewer), because the API clones only public ones.
- The public template page uses the active ownership context for its plan check, Save, and Start Run. In an Organization it follows the viewer's Organization Role, as the template detail page does: roles that cannot add Templates to the Organization (runners and viewers) see no Save or Copy to Library, roles that cannot start runs (viewers) see no Start Run, and the page says which actions their role does not allow. Save opens the new copy, and a copy into an Organization reports "Template copied to this Organization". In Personal, a signed-in Free user's Save buttons read "Upgrade to save" and "Upgrade to copy template", since the click starts checkout; they are disabled while the plan loads, and when the plan check fails they keep their plain labels and a click asks the user to try again. An Organization never sees an upgrade label there, because the API checks its Template limit. When an Organization's plan blocks the action, the page explains that the Organization needs a paid plan instead of starting a Personal checkout.
- Template history is stored in `template_versions`; related actor/action history is stored in `audit_events`. The template detail Changelog shows both as one list, newest first (the latest 8 entries): every version, plus the changes that create no version, such as archive, restore, and making a template public or private. A version and the audit event recorded with it appear once. The Changelog refreshes after any template change. A save that changes nothing adds no version. A visibility change (Share or the Public/Private switch) adds a version but never changes the checklist content version, so runs are not staled.
- The Public/Private switch on template detail sends only the visibility flag, so it never reconciles or stales runs.

## Runs And Sharing

- Users can start checklist runs from templates.
- Run titles are limited to 160 characters, the same limit as template titles, counted after trimming (`src/lib/schemas/nameLimits.ts`, matching the API). Every Start Run entry point (My Templates, template detail and the public template page) gives the same default run name, "<template title> - <date and time>", and a run name left blank gets that default; when it would be too long, the template title is shortened with an ellipsis so the date and time stay. The Start Run name field and the rename boxes stop at the limit, a longer title gets a clear message instead of the API's schema error, and a Start Run that fails keeps the typed name for the retry.
- Runs store progress independently from templates. Progress counts every task and sub-task as one unit and is a whole percentage: 100% only when every unit is done, 0% only when none is, and anything in between rounds to 1-99% (so 199 of 200 is 99%, not 100%). The app and the API compute it with the same function (`src/lib/progress.ts`).
- A task with sub-tasks is done when every sub-task in all of its Sub-tasks blocks is ticked, and unticking any of them reopens the task. Mark Complete ticks or unticks all of them. The web app and the agent API use the same rule.
- Run task counts ("2 of 5 tasks finished", the task list, "Task N of M", the runs list) count tasks only, never sub-tasks. The progress percentage and its bars follow the progress rule above, the same value the API stores as the run's progress.
- The run page lists every task and opens any of them directly: in a side column on wide screens, and from a Tasks button in the progress block on phones and narrower windows.
- Moving to another task on the run page (Mark Complete, Next, Previous, or a task list) scrolls back to that task's title when it is out of view, just below the sticky headers. Mark Complete, Next, Previous and the side task list also move focus to the title; the phone Tasks sheet returns focus to its Tasks button, as dialogs do. The rest of a double click that lands after that scroll is ignored. Opening a run, or saving a change to the task on screen, never moves the page or takes focus, and a field the user is typing in keeps its focus.
- The run page saves one change at a time. Each tick or untick sets the value the user clicked rather than flipping the saved one, so a click made while an earlier save is still in flight never reverses it, and a click that changes nothing sends no save. Completing a task moves on to the next unfinished task only if the completed task is still open when its save lands; a task the user opened while the save was in flight stays open.
- Run page controls that change what they do after a click (Next Task becomes the next task's Mark Complete, a completed task moves on to the next one, Rename becomes Save title) ignore the second click of a double click, and the completion prompt stays open through the rest of the double click that opened it. Saving an unchanged run title sends nothing.
- Ticking every task does not complete a run; the user confirms completion. While every task is done and the run is still in progress, the run page (private and shared) offers a Complete run action, so a dismissed prompt, a reload, or tasks ticked over MCP never leave a run stuck in progress. Active-run limits count runs until they are completed.
- A completed run is frozen on the run page and through its share link: its tasks and sub-tasks can no longer be ticked or unticked, so it never reads Completed with open tasks. Run Keys follow the same rule: MCP `update_run` with `set_run_status` `completed` fails with `run_incomplete` (naming up to 20 open task ids) unless the run has tasks and every task and Sub-task is done; marking an already completed run completed again still succeeds. Task notes stay editable. The web app has no Reopen action yet.
- The runs list (`/dashboard/runs`) links each run to its source Template and matches searches on that Template's title and owner. The source can be a public catalog Template or one of the viewer's Personal or active Organization Templates, public or private. Runs started from library Templates have no source link.
- Runs record both the template content version last reconciled and a run revision. API responses expose `is_stale` when the source checklist structure is newer; metadata-only template edits do not stale runs.
- Completed, archived, and publicly shared runs are frozen when a template changes. A completed private run can be explicitly reconciled and reopened with `POST /api/checklists/:id/revalidate`; reopening counts toward the active-run limit like starting a run.
- A run copies template content (at creation and revalidation) only from a source the caller may still use: a public template, the caller's own Personal template, or a template of the run's own Organization. A run whose source is no longer usable (made private by its owner, or archived) is not reported stale for that caller, and revalidating it returns `404`.
- Runs that predate stable identities are conservatively marked stale during migration. Their legacy IDs are backfilled deterministically, and their completion/notes remain intact until explicit reconciliation.
- Task notes belong to the run. Unsaved notes stay with their task while the user moves between tasks, are saved with Mark Complete (in the same save, also when another session or a sub-task already completed the task) and when the run is completed, and are never replaced by a save that returns while the user is still typing. Leaving the page with unsaved notes asks for confirmation.
- Run and template saves use optimistic revision/version markers. A stale editor receives `409 edit_conflict` instead of overwriting newer work. Where the page can reload the record without losing the user's input, it does so before the control re-enables: Revalidate on the runs list reloads the list (also on `409 shared_run_conflict` or a `404`), and the template page's visibility switch and share action reload the template, so the next click sends the current revision or version. Each run's Revalidate stays disabled until that run's own request finishes, even while other runs revalidate. The template editor loads the template by id when it opens, never from the cached template lists, and checks against the version it loaded (then the version its last save returned), so a background list refresh cannot hide another editor's save, and it resends visibility only when its own switch changed. After a conflict it keeps the user's draft and offers to load the latest version, replacing the unsaved changes only once the user confirms.
- When another session (an Organization member, a shared link, a second tab, or an MCP agent) saved the run first, the run page (private and shared) loads the latest run, shows it, and retries the change once on it, so later saves never keep failing on an old revision. A tick or untick is retried as the value the user chose, so a tick made elsewhere is never undone. Notes, a title, or completion are not retried when someone else changed the notes being saved or the title; the page then shows the latest run, keeps the unsaved notes, and asks the user to check and try again.
- A run records who completed it and when (`completed_by_user_id`, `completed_at`) only when it becomes completed. Later saves of a completed run (a rename, a tick, a note), by anyone, keep the original completer and time, and a client-sent `completed_at` is used only on that transition. Reopening from the run page, a share link, or MCP keeps both; revalidation clears both. A completion through a share link names the visitor only when they belong to the run's owner context, and otherwise no one, so a reopened run never keeps its previous completer. The logic is in `functions/api/utils/run-completion.ts`.
- Run-level sharing creates public `/share/:token` links (`POST /api/checklists/run/:id/share`). Sharing again mints a new link, and the previous one stops working. The run page and the runs list show the created link in a dialog with a Copy button, so it is never lost when the browser refuses the automatic copy. The runs list shows a run as shared right away, so a stale shared run reads "Shared snapshot is out of date" and is not offered Revalidate.
- Stop sharing (`DELETE /api/checklists/run/:id/share`, in the runs list menu and next to Share on the run page, which also marks a shared run) makes the run private and turns its link off; progress and tasks are kept. Anyone who may update the run can share it or stop sharing it. The runs list marks shared runs, and a shared run that went stale offers "Stop sharing to update", after which it can be revalidated.
- Guests can open shared runs without logging in and update checklist completion state: task and sub-item completion, task notes (up to 5,000 characters), and the run's status. The server merges only those fields onto the stored run by task id; titles, descriptions, contents, and the task list itself always come from the stored run, and progress and completion time are computed on the server.
- Shared runs do not expose owner-only title editing or destructive actions, and the guest view does not reveal who owns or worked on the run.
- Current run gating is plan-limit based through active-run limits.

## Personal And Organization Contexts

- Users always have a Personal context and can belong to Organizations.
- Organization-owned templates and runs are shared with active Organization members.
- Context switching is available from the dashboard shell and persists locally. This remembered selection is transitional convenience state; canonical Organization routes are tracked in issue #212. A new tab starts in the remembered context; switching in one tab does not switch tabs that are already open. If the Organization list fails to load, the app shows an error with Retry (or Continue in Personal) instead of switching to Personal.
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
- `409 edit_conflict`: a template or run changed after the editor loaded it; load the latest version before retrying (the runs list and the template page refresh by themselves, see `src/lib/editConflicts.ts`; the template editor offers Load latest version).
- `400` on a template create or update payload: the message starts with the failing field (for example `seoDescription: ...`) and `details.field` names it.
- `413 content_too_large`: the Template or run content would be larger than a save can send back (`details.limit` in bytes, see `src/lib/schemas/contentLimits.ts`): 768KB for a Template and 896KB for a run, counting what the app adds to every task. It covers creating, saving and copying a Template, starting a run, and saving or revalidating a run. A save that does not grow content already over the limit still goes through, so it can be trimmed. A Template change skips a run it would grow past the limit, and that run stays stale.
- `429 rate_limited` (auth routes): too many attempts from this network; the body's
  `retryAfterSeconds` and the `Retry-After` header say how long to wait. Auth errors
  also carry `message`, which the Better Auth client reads.

The client preserves API `status`, `code`, and `details` so UI behavior does not depend on string matching generic error messages.
