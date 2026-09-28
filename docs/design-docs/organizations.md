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

Ownership and membership writes re-check their conditions inside the D1 batch that
applies them (`functions/api/handlers/team-membership.ts`), because another manager can
change the same rows between the handler's read and its write:

- A transfer demotes the owner only while the target is still an active non-owner and
  the Organization is not archived, promotes the target only if that demotion happened,
  and moves the billing owner and writes the `team.owner_transferred` audit event only if
  the promotion happened. Otherwise nothing changes and the route returns 409
  `owner_transfer_conflict`; repeating a transfer that already happened succeeds.
- A member update applies only while the row is not the owner, is not the actor, and the
  actor is still an active `owner` or `admin`. Otherwise the route returns 409
  `member_update_conflict` and writes no audit event.

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
- `PUT /api/teams/:teamId/members/:memberId`: update role or status. Requires `owner` or `admin`; owners cannot be changed through this route. A status change also revokes the member's pending invites to that Organization.
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

Accepting an invite reactivates a disabled membership with the invite's role. Changing a
member's status (disable or re-enable) revokes that member's pending invites to the
Organization in the same batch, with a `team_invite.revoked` audit event whose metadata
is `{ "reason": "member_status_changed" }`. An invite made while a member was disabled
therefore cannot re-enable them after an admin re-enables and disables them again; to
re-admit a disabled member, create a new invite after disabling them.

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
