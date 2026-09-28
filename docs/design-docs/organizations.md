# Organizations

Organizations let multiple authenticated Users share Templates, start and view Runs, and manage membership without adding paid infrastructure. All ownership, role, invite, entitlement, and history data lives in D1.

Implementation identifiers in this document retain legacy `team` naming.
User-facing language follows the [product glossary](../PRODUCT_SENSE.md) and the
[Personal and Organization contexts decision](personal-and-organization-contexts.md).

## Product Contract

- Every signed-in User always has a Personal ownership context.
- A User can also belong to one or more Organizations.
- Templates and Runs are scoped to the selected Personal or Organization context.
- A private Organization Template's content stays in its Organization. Members can open it
  from any context, and its Runs and copies go to its Organization, not the active context
  (`src/lib/templateDestination.ts`). When that is not the active context, the template
  page's success toast names the Organization ("Run started in <Organization>", "Template
  duplicated in <Organization>"). The API never snapshots it into another context: a
  request naming another Organization gets `409 organization_mismatch` with the owning
  Organization's id for its members, and `404` for everyone else. Public Templates and a
  User's own Personal Templates run and copy into the active context.
- Personal data stays Personal. Organization Membership does not upgrade or expose a User's Personal Templates, Runs, or limits.
- Organization entitlements apply only while that Organization context is active. A Free User in a paid Organization can use its paid capabilities, but their Personal context remains Free unless they upgrade their own plan.

## Roles

| Role | Organization management | Template editing | Run execution | Read access |
| --- | --- | --- | --- | --- |
| `owner` | Yes | Yes | Yes | Yes |
| `admin` | Yes | Yes | Yes | Yes |
| `editor` | No | Yes | Yes | Yes |
| `runner` | No | No | Yes | Yes |
| `viewer` | No | No | No | Yes |

There must be exactly one active `owner` role per Organization. Role transfers demote the current `owner` to `admin` and promote the selected active member to `owner`.

## Data Model

Source of truth: `db/migrations/0021_add_teams_audit_history.sql` and `db/migrations/0022_enforce_single_active_team_owner.sql`.

- `teams`: legacy implementation table for Organization identity, slug, creator, billing owner, and archive status.
- `team_members`: legacy implementation table for Organization Membership, role, status, inviter, and join timestamps.
- `team_invites`: legacy implementation table for hashed Organization invite tokens and their lifecycle.
- `team_entitlement_overrides`: legacy implementation table for D1-backed Organization plan overrides.
- `audit_events`: append-only actor/resource/action history for Organization and Template changes.
- `template_versions`: snapshot history for template changes with changed-by user and subject scope.
- `templates.owner_type`, `templates.team_id`, `templates.created_by_user_id`, `templates.updated_by_user_id`, `templates.deleted_at`: Resource Owner scope and soft-delete support; `team_id` is the legacy Organization foreign key.
- `checklist_runs.team_id`, `checklist_runs.created_by_user_id`, `checklist_runs.assigned_to_user_id`, `checklist_runs.started_by_user_id`, `checklist_runs.completed_by_user_id`, `checklist_runs.deleted_at`: Organization Run ownership and attribution; `team_id` is the legacy Organization foreign key.

## API Routes

Organization operations use legacy `/api/teams` route identifiers and require a Better Auth session cookie.

- `GET /api/teams`: list active Organizations for the current User.
- `POST /api/teams`: create an Organization and its `owner` membership.
- `GET /api/teams/:teamId`: read Organization details for a member.
- `PUT /api/teams/:teamId`: update an Organization name or slug. Requires `owner` or `admin`.
- `GET /api/teams/:teamId/members`: list members. Managers can see inactive rows; non-managers see active members.
- `PUT /api/teams/:teamId/members/:memberId`: update role or status. Requires `owner` or `admin`; owners cannot be changed through this route.
- `PUT /api/teams/:teamId/owner`: transfer the Organization's `owner` role. Requires current `owner`.
- `GET /api/teams/:teamId/invites`: list pending invites. Requires `owner` or `admin`.
- `POST /api/teams/:teamId/invites`: create a link invite. Requires `owner` or `admin`.
- `DELETE /api/teams/:teamId/invites/:inviteId`: revoke a pending invite. Requires `owner` or `admin`.
- `GET /api/teams/:teamId/activity`: read Organization audit history. Requires `owner` or `admin`.
- `GET /api/teams/invites/pending`: list pending invites for the current user's email.
- `POST /api/teams/invites/pending/:inviteId/accept`: accept from the settings page.
- `POST /api/teams/invites/:token/accept`: accept from a link.

Template and Run routes accept the legacy `teamId` parameter where Organization scoping is supported:

- `GET /api/templates?teamId=...`
- `GET /api/templates/archived?teamId=...`
- `POST /api/templates` with `teamId`
- `PUT /api/templates/:id` in the active ownership context
- `POST /api/templates/:id/clone` with `teamId`
- `GET /api/checklists?teamId=...`
- `GET /api/checklists/archived?teamId=...`
- `POST /api/checklists` with `teamId`
- `POST /api/checklists/:templateId/share` with `teamId`

## Invite Flow

Invites are link-based today:

1. A manager creates an invite from `/dashboard/settings`.
2. The API stores only `token_hash`, never the raw invite token.
3. The response includes `delivery.mode = "link"`, `invitePath`, and `inviteUrl`.
4. Invitees can accept through the legacy compatibility route `/team-invites/:token` or from incoming invites on `/dashboard/settings`.

The API response already uses a `delivery` object so email can be added later without changing the UI contract. A future email implementation should keep the link accept route and switch delivery from `link` to a queued/sent email mode.

## UI Flow

- Context state is managed by the legacy-named `src/contexts/WorkspaceContext.tsx`.
- The remembered context is persisted under the legacy local-storage key `serplists.activeWorkspaceId`.
- Every tab shares that key, so it only seeds a tab: it is read once per signed-in user. After that a tab keeps its own selection and never follows a context another tab stored (`src/contexts/workspaceSelection.ts`).
- A stored Organization stays selected until a teams list from the server confirms or rules it out. Only a settled, successful list that leaves it out (membership removed, or a stale id) falls back to Personal. While the teams request is loading, paused offline, or failed, `workspaceStatus` is `loading` or `error`: the Template and Run lists stay disabled (the public catalog, the same for everyone, still loads), the switcher never reads "Personal", and a create, run or import that would go to the active context is refused. On `error`, console pages show "Couldn't load your Organizations" with Retry and Continue in Personal, and the switcher offers Personal and a retry. A Personal context never waits on, or fails with, the teams request.
- Templates and Runs invalidate React Query caches when the context changes.
- `/dashboard/settings` currently combines Account, Organization, member, invite, and billing controls; issue #206 tracks their explicit separation.
- `/account` and `/dashboard/profile` are legacy redirects to `/dashboard/settings`.

## Audit And History

Organization changes write to `audit_events` with actor, subject, resource, action, before/after/diff JSON, request id, hashed IP, user agent, and timestamp.

Template changes write both:

- `template_versions` for snapshot history.
- `audit_events` for actor/resource/action history.

## Local Verification

Run local schema and seeds:

```bash
pnpm run db:reset
```

Seeded dev users:

- `checklists@serp.co`
- `admin@test.com`
- `john@test.com`
- `jane@test.com`
- `bob@test.com`

Password for all seeded users: `password123`.

The local seed includes Organization data, memberships, invites, entitlement overrides, and audit rows. Fixture and test filenames retain legacy `team` identifiers.

Targeted checks:

```bash
pnpm run test:run tests/unit/functions/api/teams-handler.test.ts
pnpm run test:run tests/unit/components/TeamSettingsSection.test.tsx
pnpm run test:e2e -- tests/e2e/team-workspace.spec.ts
pnpm run test:e2e -- tests/e2e/team-invite-flow.spec.ts
```
