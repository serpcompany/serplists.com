# Team Workspaces Module

Team workspaces let multiple authenticated users share templates, start and view runs, and manage membership without adding new paid infrastructure. All ownership, role, invite, entitlement, and history data lives in D1.

## Product Contract

- Every signed-in user always has a personal workspace.
- A user can also belong to one or more team workspaces.
- Templates and runs are scoped to the selected workspace.
- Personal data stays personal. A team membership does not upgrade or expose a user's personal templates, runs, or limits.
- Team entitlements apply only while the team workspace is active. A Free user on a paid team can use the paid team capabilities in that team, but their personal workspace remains Free unless they upgrade their own account.

## Roles

| Role | Team management | Template editing | Run execution | Read access |
| --- | --- | --- | --- | --- |
| `owner` | Yes | Yes | Yes | Yes |
| `admin` | Yes | Yes | Yes | Yes |
| `editor` | No | Yes | Yes | Yes |
| `runner` | No | No | Yes | Yes |
| `viewer` | No | No | No | Yes |

There must be exactly one active owner per team. Ownership transfers demote the current owner to `admin` and promote the selected active member to `owner`.

## Data Model

Source of truth: `db/migrations/0021_add_teams_audit_history.sql` and `db/migrations/0022_enforce_single_active_team_owner.sql`.

- `teams`: team identity, slug, creator, billing owner, and archive status.
- `team_members`: user memberships, role, status, inviter, and join timestamps.
- `team_invites`: hashed link tokens, invitee email, requested role, expiration, acceptance, and revocation state.
- `team_entitlement_overrides`: D1-backed team plan overrides. This is the no-new-cost path for team plan access until billing is expanded.
- `audit_events`: append-only actor/resource/action history for team and template changes.
- `template_versions`: snapshot history for template changes with changed-by user and subject scope.
- `templates.owner_type`, `templates.team_id`, `templates.created_by_user_id`, `templates.updated_by_user_id`, `templates.deleted_at`: workspace ownership and soft-delete support.
- `checklist_runs.team_id`, `checklist_runs.created_by_user_id`, `checklist_runs.assigned_to_user_id`, `checklist_runs.started_by_user_id`, `checklist_runs.completed_by_user_id`, `checklist_runs.deleted_at`: team run ownership and attribution.

## API Routes

Team routes require a Better Auth session cookie.

- `GET /api/teams`: list active teams for the current user.
- `POST /api/teams`: create a team and owner membership.
- `GET /api/teams/:teamId`: read team details for a member.
- `PUT /api/teams/:teamId`: update team name or slug. Requires `owner` or `admin`.
- `GET /api/teams/:teamId/members`: list members. Managers can see inactive rows; non-managers see active members.
- `PUT /api/teams/:teamId/members/:memberId`: update role or status. Requires `owner` or `admin`; owners cannot be changed through this route.
- `PUT /api/teams/:teamId/owner`: transfer team ownership. Requires current `owner`.
- `GET /api/teams/:teamId/invites`: list pending invites. Requires `owner` or `admin`.
- `POST /api/teams/:teamId/invites`: create a link invite. Requires `owner` or `admin`.
- `DELETE /api/teams/:teamId/invites/:inviteId`: revoke a pending invite. Requires `owner` or `admin`.
- `GET /api/teams/:teamId/activity`: read team audit history. Requires `owner` or `admin`.
- `GET /api/teams/invites/pending`: list pending invites for the current user's email.
- `POST /api/teams/invites/pending/:inviteId/accept`: accept from the settings page.
- `POST /api/teams/invites/:token/accept`: accept from a link.

Template and run routes accept `teamId` where workspace scoping is supported:

- `GET /api/templates?teamId=...`
- `GET /api/templates/archived?teamId=...`
- `POST /api/templates` with `teamId`
- `PUT /api/templates/:id` in the active workspace
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
4. Invitees can accept through `/team-invites/:token` or from the incoming invites area on `/dashboard/settings`.

The API response already uses a `delivery` object so email can be added later without changing the UI contract. A future email implementation should keep the link accept route and switch delivery from `link` to a queued/sent email mode.

## UI Flow

- Workspace state is managed by `src/contexts/WorkspaceContext.tsx`.
- Active workspace is persisted in local storage with `serplists.activeWorkspaceId`.
- Templates and runs invalidate React Query caches when the workspace changes.
- `/dashboard/settings` is the canonical account, team, member, invite, billing, and incoming-invite page.
- `/account` and `/dashboard/profile` are legacy redirects to `/dashboard/settings`.

## Audit And History

Team changes write to `audit_events` with actor, subject, resource, action, before/after/diff JSON, request id, hashed IP, user agent, and timestamp.

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

The local seed includes team data, memberships, invites, team entitlement overrides, and audit rows so the team settings UI can be verified without creating all data manually.

Targeted checks:

```bash
pnpm run test:run -- tests/unit/functions/api/teams-handler.test.ts
pnpm run test:run -- tests/unit/components/TeamSettingsSection.test.tsx
pnpm run test:e2e -- tests/e2e/team-workspace.spec.ts
pnpm run test:e2e -- tests/e2e/team-invite-flow.spec.ts
```