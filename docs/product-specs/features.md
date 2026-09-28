# Features


## Auth And Account

- Better Auth is the canonical session layer for email sign-up, sign-in, sign-out, password changes, password reset, email verification, session lookup, and session revocation.
- Browser auth state uses Better Auth httpOnly cookies. The client does not store auth tokens.
- Protected routes preserve the originally requested destination and return users there after sign-in.
- Password strength rules are enforced for registration and password changes.
- `/dashboard/settings` is the canonical settings/account page.
- `/account` and `/dashboard/profile` redirect to `/dashboard/settings`.
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
- Template detail pages render a read-only preview first. Editing happens on `/dashboard/templates/:id/edit`.
- In the editor, sections, tasks and a task's content blocks reorder by dragging their handle, or with the Up and Down arrow keys on the focused handle. Blocks keep their ids when they move, and runs and public pages show blocks in the saved order.
- Template detail, public template, and public profile pages say a template or user was not found only when the API answers 404 (or the template is not public under that owner). A server or network failure shows "Unable to load" with a Try again button instead. Because every route is served with HTTP 200, the public template and public profile not-found states set `robots` to `noindex, nofollow` so a removed, private or renamed page drops out of search; the "Unable to load" state does not, so a brief outage never deindexes a live page.
- Template titles are limited to 160 characters. Duplicate names the copy "<title> Copy"; when that would be too long, the title is shortened so the copy still fits.
- Export JSON on the template detail page downloads that template as a portable template pack, the format Import Templates accepts, named after its slug (or its id when it has none). Like Import Templates, it needs a paid plan in the active ownership context; otherwise the item reads "Upgrade to export".
- Template content updates reconcile into matching active, private runs for the same Resource Owner. Stable section, item, and sub-item IDs preserve run completion and notes across renames and reordering; new work arrives incomplete, and retired work leaves readiness calculations while remaining in run history.
- On the template detail page, an Organization's Template is managed by the viewer's Organization Role while that Organization is active, never by who created it: owners, admins, and editors get Share, Edit, Duplicate, Export, Archive, and the visibility switch; runners and viewers, including a Creator who was demoted, get read-only controls. From any other context it is read-only. A Personal Template is managed only by its owner. Share links for Organization Templates still use the Creator's username until Organization Public Profiles exist.
- Public templates can be shared at `/profile/{username}/{templateSlug}`. Share on the template detail page makes a private template public only after that URL resolves; an owner without a username is asked to set one and the template stays private. The visibility switch changes only visibility; the badge and switch always show what the server holds after either one, and neither can start while the other is saving.
- The editor's Search & SEO panel previews that URL: the username is the template's creator (also for an Organization's template), and the slug is the one a save stores (a blank slug keeps the saved one, or for a new template comes from its name). It says when the creator has no username or the template is private, and notes that a slug another template already uses gets a short suffix.
- Other Users can copy public templates into Personal or an authorized Organization when that ownership context's entitlement allows it. Copying into Personal is a Pro feature, so the browser checks the Personal plan first. In an Organization the API decides: a Free Organization may copy within its Template limit, the template detail page labels the button "Copy to Organization", and roles that cannot add Templates to the Organization do not see it. The template detail page offers no copy on a private template (such as a private Organization Template viewed from Personal or by a viewer), because the API clones only public ones.
- The public template page uses the active ownership context for its plan check, Save, and Start Run. In an Organization it follows the viewer's Organization Role, as the template detail page does: roles that cannot add Templates to the Organization (runners and viewers) see no Save or Copy to Library, roles that cannot start runs (viewers) see no Start Run, and the page says which actions their role does not allow. Save opens the new copy, and a copy into an Organization reports "Template copied to this Organization". In Personal, a signed-in Free user's Save buttons read "Upgrade to save" and "Upgrade to copy template", since the click starts checkout; they are disabled while the plan loads, and when the plan check fails they keep their plain labels and a click asks the user to try again. An Organization never sees an upgrade label there, because the API checks its Template limit. When an Organization's plan blocks the action, the page explains that the Organization needs a paid plan instead of starting a Personal checkout.
- Template history is stored in `template_versions`; related actor/action history is stored in `audit_events`. The template detail Changelog shows both as one list, newest first (the latest 8 entries): every version, plus the changes that create no version, such as archive, restore, and making a template public or private. A version and the audit event recorded with it appear once. The Changelog refreshes after any template change.

## Runs And Sharing

- Users can start checklist runs from templates.
- Run titles are limited to 160 characters, the same limit as template titles. Every Start Run entry point (My Templates, template detail and the public template page) gives the same default run name, "<template title> - <date and time>", and a run name left blank gets that default; when it would be too long, the template title is shortened with an ellipsis so the date and time stay. Run name fields stop typing at 160 characters.
- Runs store progress independently from templates.
- Runs record both the template content version last reconciled and a run revision. API responses expose `is_stale` when the source checklist structure is newer; metadata-only template edits do not stale runs.
- Completed, archived, and publicly shared runs are frozen when a template changes. A completed private run can be explicitly reconciled and reopened with `POST /api/checklists/:id/revalidate`.
- Runs that predate stable identities are conservatively marked stale during migration. Their legacy IDs are backfilled deterministically, and their completion/notes remain intact until explicit reconciliation.
- Run and template saves use optimistic revision/version markers. A stale editor receives `409 edit_conflict` instead of overwriting newer work. Where the page can reload the record without losing the user's input, it does so before the control re-enables: Revalidate on the runs list reloads the list (also on `409 shared_run_conflict` or a `404`), and the template page's visibility switch and share action reload the template, so the next click sends the current revision or version. The template editor loads the template by id when it opens, never from the cached template lists, and checks against the version it loaded (then the version its last save returned), so a background list refresh cannot hide another editor's save. After a conflict it keeps the user's draft and offers to load the latest version, replacing the unsaved changes only once the user confirms.
- Run-level sharing creates public `/share/:token` links.
- Guests can open shared runs without logging in and update checklist completion state.
- Shared runs do not expose owner-only title editing or destructive actions.
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
- Organization management currently lives on `/dashboard/settings`.
- Organization invites are link-based today. The legacy compatibility route `/team-invites/:token` and incoming invites on `/dashboard/settings` support acceptance.
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

`admin@test.com` and `jane@test.com` are treated as Pro dev personas. `john@test.com` and `bob@test.com` remain Free. Local seeds also include Organization Memberships, pending invites, Organization entitlement overrides, and audit rows. The underlying fixtures retain legacy `team` implementation names.

## Error Contract

- `401 Unauthorized`: the user must sign in.
- `403 upgrade_required`: the active Personal or Organization context needs a paid entitlement.
- `403 limit_reached`: the active Personal or Organization context hit a plan limit.
- `403 Forbidden`: the user is signed in but lacks the required role or permission.
- `503 billing_unavailable`: paid action cannot be started because billing config is unavailable.
- `503 auth_email_unavailable`: auth email delivery is unavailable for flows that require outbound email.
- `409 edit_conflict`: a template or run changed after the editor loaded it; load the latest version before retrying (the runs list and the template page refresh by themselves, see `src/lib/editConflicts.ts`; the template editor offers Load latest version).
- `400` on a template create or update payload: the message starts with the failing field (for example `seoDescription: ...`) and `details.field` names it.

The client preserves API `status`, `code`, and `details` so UI behavior does not depend on string matching generic error messages.
