# Organizations

Organizations let multiple authenticated Users share Templates, start and view Runs, and manage membership without adding paid infrastructure. All ownership, role, invite, entitlement, and history data lives in D1.

Implementation identifiers in this document retain legacy `team` naming.
User-facing language follows the [product glossary](../PRODUCT_SENSE.md) and the
[Personal and Organization contexts decision](personal-and-organization-contexts.md).

## Product Contract

- Every signed-in User always has a Personal ownership context.
- A User can also belong to one or more Organizations.
- Templates and Runs are scoped to the selected Personal or Organization context.
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
- `POST /api/teams/:teamId/leave`: leave the Organization. Any active member except the `owner` (who gets `400 owner_must_transfer`); deletes the membership row so a manager cannot re-activate it, and records `team_member.left`.
- `GET /api/teams/:teamId/invites`: list pending invites. Requires `owner` or `admin`.
- `POST /api/teams/:teamId/invites`: create a link invite. Requires `owner` or `admin`.
- `DELETE /api/teams/:teamId/invites/:inviteId`: revoke a pending invite. Requires `owner` or `admin`.
- `GET /api/teams/:teamId/activity`: read Organization audit history. Requires `owner` or `admin`.
- `GET /api/teams/invites/pending`: list pending invites for the current user's email.
- `POST /api/teams/invites/pending/:inviteId/accept`: accept from the settings page.
- `GET /api/teams/invites/:token`: read-only preview of a link invite (Organization, inviter, role, expiry, and `status` `pending` or `already_member`). Only the invited email sees it: another account gets `403 invite_email_mismatch` with no Organization details; revoked, used, or archived invites return `404`, expired ones `410`.
- `POST /api/teams/invites/:token/accept`: accept from a link.
- `POST /api/teams/invites/:token/decline`: the invited email revokes its own pending invite and records `team_invite.declined`.

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
5. Opening `/team-invites/:token` never joins anyone. The page loads the read-only preview and shows the Organization, inviter, and role with **Accept invite** and **Decline**; only a click accepts. Accepting leaves the active context unchanged and offers **Switch to <Organization>**, so a link from another site cannot quietly move a User's new Templates and Runs into an Organization.
6. Members other than the `owner` can leave from **Leave Organization** on `/dashboard/settings`, which returns them to Personal.

The API response already uses a `delivery` object so email can be added later without changing the UI contract. A future email implementation should keep the link accept route and switch delivery from `link` to a queued/sent email mode.

## UI Flow

- Context state is managed by the legacy-named `src/contexts/WorkspaceContext.tsx`.
- The remembered context is persisted under the legacy local-storage key `serplists.activeWorkspaceId`.
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
