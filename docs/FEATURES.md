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
- Template content updates propagate to matching active runs for the same owner/workspace.
- Public templates can be shared at `/profile/{username}/{templateSlug}`.
- Other users can copy public templates into their account or an authorized team workspace when their active entitlement context allows it.
- Template history is stored in `template_versions`; related actor/action history is stored in `audit_events`.

## Runs And Sharing

- Users can start checklist runs from templates.
- Runs store progress independently from templates.
- Run-level sharing creates public `/share/:token` links.
- Guests can open shared runs without logging in and update checklist completion state.
- Shared runs do not expose owner-only title editing or destructive actions.
- Current run gating is plan-limit based through active-run limits.

## Team Workspaces

- Users always have a personal workspace and can belong to team workspaces.
- Team workspace templates and runs are shared with active team members.
- Workspace switching is available from the dashboard shell and persists locally.
- Team roles:
  - `owner`: full team management and ownership transfer.
  - `admin`: manage team settings, members, and invites.
  - `editor`: edit team templates and start runs.
  - `runner`: start and execute runs.
  - `viewer`: read-only access.
- Team management lives on `/dashboard/settings`.
- Team invites are link-based today. Invitees can accept from `/team-invites/:token` or from incoming invites on `/dashboard/settings`.
- Team changes and template changes are recorded in DB-backed audit/history tables.

## Entitlements

- Free users have limited personal templates and active runs.
- Pro users have paid personal-workspace limits.
- Team entitlements apply only inside the selected team workspace.
- A Free user on a paid team can use paid team capabilities through that team. Their personal workspace remains Free.
- The API is the source of truth for entitlements. UI gating mirrors API behavior.

## Dev Personas

Local seeds create these users:

- `checklists@serp.co`
- `admin@test.com`
- `john@test.com`
- `jane@test.com`
- `bob@test.com`

Password for all seeded users: `password123`.

`admin@test.com` and `jane@test.com` are treated as Pro dev personas. `john@test.com` and `bob@test.com` remain Free. Local seeds also include team memberships, pending invites, team entitlement overrides, and audit rows for team verification.

## Error Contract

- `401 Unauthorized`: the user must sign in.
- `403 upgrade_required`: the active user/workspace needs a paid entitlement.
- `403 limit_reached`: the active user/workspace hit a plan limit.
- `403 Forbidden`: the user is signed in but lacks the required role or permission.
- `503 billing_unavailable`: paid action cannot be started because billing config is unavailable.
- `503 auth_email_unavailable`: auth email delivery is unavailable for flows that require outbound email.

The client preserves API `status`, `code`, and `details` so UI behavior does not depend on string matching generic error messages.
