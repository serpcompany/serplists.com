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

## Templates

- Users can create, edit, archive, restore, import, and export templates.
- Template detail pages render a read-only preview first. Editing happens on `/dashboard/templates/:id/edit`.
- Template content updates reconcile into matching active, private runs for the same Resource Owner. Stable section, item, and sub-item IDs preserve run completion and notes across renames and reordering; new work arrives incomplete, and retired work leaves readiness calculations while remaining in run history.
- Public templates can be shared at `/profile/{username}/{templateSlug}`. That is their only public URL, so the template library (`/templates`) and category pages list a public template only when its owner has a username, as the sitemaps do. The page also opens for other casings of the username and for the template id, but its canonical URL and `og:url` are always `https://serplists.com/profile/{username}/{templateSlug}` with the stored username casing and no query string, matching the sitemap entry.
- The template library keeps its search, sort and category filters in the URL (`?search=`, `?sort=`, `?category=`), so links and Back/Forward change what it shows. A link to `/templates?category={slug}` with no other filter redirects to `/categories/{slug}`; the library's own filter edits never redirect.
- Each category a public template uses has a page at `/categories/{slug}`. The slug keeps letters and digits in any script (`日本語`, `русский`), drops accents on Latin letters (`Café Culture` is `cafe-culture`), and joins words with hyphens. The page and the category sitemap build it with the same function (`src/lib/categorySlug.ts`), and the page also opens for other letter cases and Unicode forms of the slug. An old ASCII-only slug (`caf-culture`) redirects to the current one. A category with no letters or digits (only emoji or punctuation) has no page: it is not listed as a category and shows as plain text on the template.
- Other Users can copy public templates into Personal or an authorized Organization when that ownership context's entitlement allows it.
- Template history is stored in `template_versions`; related actor/action history is stored in `audit_events`.

## Runs And Sharing

- Users can start checklist runs from templates.
- Runs store progress independently from templates.
- Runs record both the template content version last reconciled and a run revision. API responses expose `is_stale` when the source checklist structure is newer; metadata-only template edits do not stale runs.
- Completed, archived, and publicly shared runs are frozen when a template changes. A completed private run can be explicitly reconciled and reopened with `POST /api/checklists/:id/revalidate`.
- Runs that predate stable identities are conservatively marked stale during migration. Their legacy IDs are backfilled deterministically, and their completion/notes remain intact until explicit reconciliation.
- Run and template saves use optimistic revision/version markers. A stale editor receives `409 edit_conflict` instead of overwriting newer work.
- Run-level sharing creates public `/share/:token` links.
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
- `409 edit_conflict`: a template or run changed after the editor loaded it; refresh before retrying.

The client preserves API `status`, `code`, and `details` so UI behavior does not depend on string matching generic error messages.
