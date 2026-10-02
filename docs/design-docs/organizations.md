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
- Personal data stays Personal. Organization Membership does not upgrade or expose a User's Personal Templates, Runs, or limits. An Organization Run started from a member's Personal Template can be revalidated only by that member, and a private Organization Template never supplies content to a Personal Run (`functions/api/utils/template-access.ts`). Run creation, revalidation and a run's staleness flag share that rule for which Template may supply a run's content: never an archived one, always a public one, an Organization Template only for runs of that same Organization, and a Personal Template only for its owner's runs (Personal or Organization). Membership and role are checked separately, against the run. A run whose source the caller may not use is never stale for them, so nobody is offered a revalidation that would copy content they cannot see (`checklistRunSelectFor` in `functions/api/utils/checklist-runs.ts`).
- Organization entitlements apply only while that Organization context is active. A Free User in a paid Organization can use its paid capabilities, but their Personal context remains Free unless they upgrade their own plan.

## Roles

| Role | Organization management | Template editing | Run execution | Read access |
| --- | --- | --- | --- | --- |
| `owner` | Yes | Yes | Yes | Yes |
| `admin` | Yes | Yes | Yes | Yes |
| `editor` | No | Yes | Yes | Yes |
| `runner` | No | No | Yes | Yes |
| `viewer` | No | No | No | Yes |

Run permissions (`functions/api/utils/run-access.ts`) follow this table for an
Organization run (reading needs `viewer`, saving `runner`, archiving and restoring
`admin`), and a Personal run belongs to its owner. An archived run can only be read
through its history or restored. Runs and Templates decide this with one helper over
their ownership columns (`ownerGrants` in `functions/api/utils/owner-access.ts`): with a
`team_id`, an active member whose role grants the action; without one, the `user_id`
alone. A Template counts its `team_id` only while its `owner_type` is `team`, so a
Personal Template that still names an Organization stays its owner's.

There must be exactly one active `owner` role per Organization. Role transfers demote the current `owner` to `admin` and promote the selected active member to `owner`.

Ownership and membership writes re-check their conditions inside the D1 batch that
applies them (`functions/api/handlers/team-membership.ts`), because another manager can
change the same rows between the handler's read and its write:

- A transfer demotes the owner only while the target is still an active non-owner and
  the Organization is not archived, promotes the target only if that demotion happened,
  and moves the billing owner and writes the `team.owner_transferred` audit event only if
  the promotion happened. Otherwise nothing changes and the route returns 409
  `owner_transfer_conflict`; repeating a transfer that already happened succeeds. The
  demotion comes first because the partial unique index from migration 0022 allows one
  active owner at any moment, and each later statement knows the one before it applied
  because that row carries this request's `updated_at`.
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
- `POST /api/teams`: create an Organization and its `owner` membership (`functions/api/handlers/team-create.ts`). A requested `slug` that another Organization uses (archived ones included) returns 409 `team_slug_exists`, as `PUT` does; a slug derived from the name gets a suffix instead. If another request takes the slug between the check and the write, `idx_teams_slug_unique` fails the batch, which writes nothing: a requested slug returns the same 409, and a name-derived slug is retried with a random suffix (up to 3 attempts, then 409).
- `GET /api/teams/:teamId`: read Organization details for a member.
- `PUT /api/teams/:teamId`: update an Organization name or slug. Requires `owner` or `admin`. A slug another Organization uses returns 409 `team_slug_exists`, including when it is saved between this request's check and its write. A body that names neither field is a 400; values that match the current ones (after trimming) return 200 without a write or audit event. The slug rules (lowercase letters, digits and hyphens) apply to a slug the caller sets; the settings form resends the stored slug, which can predate them, so `PUT` checks it only when it changes. The settings form keeps Save disabled until a field changes and sends only the changed fields; clearing the slug field keeps the current slug. A refresh of the Organizations list (Make owner, or a refetch that sees a change to any of the user's Organizations) does not replace a field the user has edited; an unedited field follows the saved value, and after a save both fields show what the server stored, such as a slug it adjusted (`useTeamSettingsForm`, `syncTeamSettingsForm`).
- `GET /api/teams/:teamId/members`: list members. Managers can see inactive rows; non-managers see active members.
- `PUT /api/teams/:teamId/members/:memberId`: update role or status. Requires `owner` or `admin`; owners cannot be changed through this route. A status change also revokes the member's pending invites to that Organization, and disabling an owner or admin or demoting them below admin revokes the pending invites they created.
- `PUT /api/teams/:teamId/owner`: transfer the Organization's `owner` role. Requires current `owner`.
- `POST /api/teams/:teamId/leave`: leave the Organization. Any active member except the `owner` (who gets `400 owner_must_transfer`); deletes the membership row so a manager cannot re-activate it, records `team_member.left`, and revokes the pending invites the member created (metadata `{ "reason": "inviter_left" }`). If the membership changed after it was read (ownership moved to the member, or they already left in another tab), nothing is deleted, revoked, or recorded and the route returns `409 membership_changed`: the audit row and the revokes are written before the delete, on the delete's own condition, because a deleted row leaves nothing to check afterwards.
- `GET /api/teams/:teamId/invites`: list pending invites whose inviter is still an active `owner` or `admin`. Requires `owner` or `admin`.
- `POST /api/teams/:teamId/invites`: create a link invite. Requires `owner` or `admin`. Returns 409 `team_invite_exists` when the email already has a pending invite whose inviter is still an active `owner` or `admin`.
- `POST /api/teams/:teamId/invites/:inviteId/link`: replace a pending invite's link. Requires `owner` or `admin`. Stores a new `token_hash` (the previous link stops working), restarts the 7-day expiry, optionally sets a new `role`, makes the caller the invite's inviter (so it also revives an invite whose inviter left or lost access), records `team_invite.link_reissued` (never the token or its hash), and returns the same shape as create. Returns `404` for an invite that is not pending in this Organization, including one accepted or revoked during the write, and when the caller stops managing the Organization before the write. An accept that read the invite before a new link was made writes nothing and returns `409 invite_acceptance_conflict` (its write requires the token and role it read), so the old link and the old role never apply: the old link then returns `404`, and the incoming list shows the new role.
- `DELETE /api/teams/:teamId/invites/:inviteId`: revoke a pending invite. Requires `owner` or `admin`. Returns 409 `invite_already_accepted` when the invite was accepted before the revoke was written, and 404 when another request revoked it first; only the request that revokes it records `team_invite.revoked`, and never a second one, even for two revokes in the same millisecond (`buildInviteRevocation` in `functions/api/utils/team-invite-revocation.ts`).
- `GET /api/teams/:teamId/activity`: read the latest Organization audit events, newest first; `?limit=` takes 1-100 (default 50). Requires `owner` or `admin`. The settings page requests the 10 it shows.
- `GET /api/teams/invites/pending`: list pending invites for the current user's email whose inviter is still an active `owner` or `admin`, leaving out Organizations the user is already an active member of.
- `POST /api/teams/invites/pending/:inviteId/accept`: accept from the settings page.
- `GET /api/teams/invites/:token`: read-only preview of a link invite (Organization, inviter, role, expiry, and `status` `pending` or `already_member`). Only the invited email sees it: another account gets `403 invite_email_mismatch` with no Organization details; revoked, used, or archived invites, and pending ones whose inviter is no longer an active `owner` or `admin`, return `404`, expired ones `410`.
- `POST /api/teams/invites/:token/accept`: accept from a link. Both accept routes return `403 invite_email_mismatch`, without the invited email, to another account.
- `POST /api/teams/invites/:token/decline`: the invited email revokes its own pending invite and records `team_invite.declined`. If the invite was accepted or revoked after it was read, nothing is recorded and the route returns `404`.

Template and Run routes accept the legacy `teamId` parameter where Organization scoping is supported:

- `GET /api/templates?teamId=...`
- `GET /api/templates/archived?teamId=...`
- `POST /api/templates` with `teamId`
- `PUT /api/templates/:id` in the active ownership context
- `POST /api/templates/:id/clone` with `teamId`
- `GET /api/checklists?teamId=...`
- `GET /api/checklists/archived?teamId=...`
- `POST /api/checklists` with `teamId`

Template list and detail responses for the owner and members name an Organization
Template's Template Owner as the Organization in `owner` (`type` `team`, its id, slug as
`publicHandle` and name as `displayName`), never its Creator, who stays in `user_id` and
`owner_username`. Public responses never name the Organization: their `owner` is only
`{ type: 'team' }`, and they carry no `team_id`, members, roles, billing or invites
([data persistence](data-persistence.md#resource-ownership)).

## Invite Flow

Invites are link-based today:

1. A manager creates an invite from `/dashboard/settings/`.
2. The API stores only `token_hash`, never the raw invite token.
3. The response includes `delivery.mode = "link"`, `invitePath`, and `inviteUrl`.
   The link is shown once. A manager who lost it uses **New link** on the pending invite, or **Create new link** when creating an invite for an email that already has one pending (`409 team_invite_exists` with `details.inviteId`); the previous link stops working.
   The link box names the invite's email and closes when that invite is revoked, or when a refreshed **Pending invites** list no longer has it (accepted, expired, or revoked elsewhere), so a dead link cannot be copied.
   The link shows before the lists reload. Once they have, the **Invite email** field is cleared only if it still holds that link's email, so an address typed in the meantime is kept.
4. Invitees can accept through the legacy compatibility route `/team-invites/:token/` or from incoming invites on `/dashboard/settings/`.
5. A signed-out invitee can **Log in to accept** or **Create an account**; both return to the invite link afterward, including through email verification.
   Opening the link while signed in to another account names that account and offers **Sign out and continue**, which waits for sign-out and then opens the login page with the invite as the return path. The preview is cached per account, so the next account never sees the previous one's answer.
6. Opening `/team-invites/:token/` never joins anyone. The page loads the read-only preview and shows the Organization, inviter, and role with **Accept invite** and **Decline**; only a click accepts. Accepting leaves the active context unchanged and offers **Switch to <Organization>**, so a link from another site cannot quietly move a User's new Templates and Runs into an Organization.
   Until the invitee answers, the page rereads the preview when the tab regains focus, so a revoked or expired invite shows up. Once that account has accepted or declined, it stops reading the preview (`useTeamInviteLink`), so the confirmation stays: a declined invite is revoked, and a later read would answer 404.
7. Members other than the `owner` can leave from **Leave Organization** on `/dashboard/settings/`, which returns them to Personal.

Accepting an invite reactivates a disabled membership with the invite's role. An active
member has nothing to accept: the accept routes return 409 `team_member_exists` (with
`details.teamId` and their current `details.role`), leave the role unchanged (an owner is
never changed by an invite), and revoke the invite with metadata
`{ "reason": "invitee_already_member" }` so it leaves the managers' pending list. Such an
invite can only be left over from older data or a race with a re-enable. Changing a
member's status (disable or re-enable) revokes that member's pending invites to the
Organization in the same batch, with a `team_invite.revoked` audit event whose metadata
is `{ "reason": "member_status_changed" }`. An invite made while a member was disabled
therefore cannot re-enable them after an admin re-enables and disables them again; to
re-admit a disabled member, create a new invite after disabling them.

An invite carries its inviter's authority. Disabling an `owner` or `admin`, or changing
their role below `admin`, revokes the pending invites they created in that Organization
in the same batch, with metadata `{ "reason": "inviter_access_removed" }`, and leaving
revokes them with `{ "reason": "inviter_left" }`; re-enabling, re-promoting, or rejoining
does not restore those invites. Accepting also requires the inviter to
still be an active `owner` or `admin` (an owner who transfers ownership stays an admin, so
their invites stay valid): otherwise the accept routes return 404 like a revoked invite,
and an inviter who loses access between the checks and the write leaves the invite
unaccepted with 409 `invite_acceptance_conflict`. An invite that was never revoked but
whose inviter lost access (older data, or one created during the revoking write) is left
out of every list and preview and does not block a new invite for the same email; a
manager who reissues its link becomes its inviter.

The API response already uses a `delivery` object so email can be added later without changing the UI contract. A future email implementation should keep the link accept route and switch delivery from `link` to a queued/sent email mode.

## UI Flow

- Context state is managed by the legacy-named `src/contexts/WorkspaceContext.tsx`.
- The remembered context is persisted under the legacy local-storage key `serplists.activeWorkspaceId`. Only `WorkspaceContext` writes it: creating an Organization or accepting an incoming invite on `/dashboard/settings/` selects that Organization through `selectWorkspace`, which stores it.
- Every tab shares that key, so it only seeds a tab: it is read once per signed-in user. After that a tab keeps its own selection and never follows a context another tab stored (`src/contexts/workspaceSelection.ts`).
- A stored Organization stays selected until a teams list from the server confirms or rules it out. Only a settled, successful list that leaves it out (membership removed, or a stale id) falls back to Personal, and the stored id is left as it is. Settled and loaded come from the query's `fetchStatus` and `data` (`describeTeamsQuery`), since React Query leaves `isLoading` and `isFetching` false both after a failed first load and while a request is paused offline. An Organization the tab just created or joined shows at once from the provider's own state (`rememberTeam`), but it is added to the cached list only when the server already sent one, so accepting an invite after the teams request failed never reads as a list without the stored Organization. `rememberTeam` also cancels a teams request in flight, which read the server before the change and would drop the Organization when it landed; the caller then calls `refreshTeams()`, the only request that confirms the stored Organization when no list was loaded. A remembered Organization lasts until the next list the server sends, and never outlives the signed-in user. Selecting a context records it as the tab's own choice even when it is already selected, so an Organization the tab just created or joined stays selected while the teams query catches up. While the teams request is loading, paused offline, or failed, `workspaceStatus` is `loading` or `error`: the Template and Run lists stay disabled (the public catalog, the same for everyone, still loads), the switcher never reads "Personal", and a create, run, import or copy of a public template that would go to the active context is refused (the template detail page's copy button reads "Loading..." and stays disabled, so it never shows the Personal plan's label). On `error`, console pages show "Couldn't load your Organizations" with Retry and Continue in Personal, and the switcher offers Personal and a retry. The public template page, the one public page that acts in the active context, shows the same notice inline (`WorkspaceErrorNotice`) above the template, and its Save labels never ask for an upgrade while the context is unconfirmed. A Personal context never waits on, or fails with, the teams request. It still says when the request failed with no list (`teamsUnavailable`): the switcher's menu shows "Couldn't load your Organizations" with a retry, Settings shows that error with Retry instead of an empty Organization list, and an Organization's run, or the Start Run of its private Template, opened from another context shows the error with Retry instead of a silent "View only" (`isRoleUnavailable`), without Continue in Personal, which would not change the Organization that owns the run or Template. Its actions stay off until the role is known.
- Templates and Runs invalidate React Query caches when the context changes ([FRONTEND.md](../FRONTEND.md#data-and-state)). A switch compares the tab's selected id, not the resolved context, so a stored Organization that was never confirmed still counts as the context being left.
- The UI offers only the actions a member's role allows, using the role in the Organization that owns the Template or Run, whichever context is active. The matrix lives in `src/lib/organizationPermissions.ts`, and a unit test keeps it equal to `functions/api/utils/team-access.ts`, which stays the authority. Viewers get a read-only run page and no create, run, edit, share, or delete actions; runners can start and execute runs but not create, copy, edit, or delete Templates; deleting a run needs admin. On `/dashboard/archive/` every member sees the archived lists, but restoring a Template needs editor and restoring a Run needs admin. A role that is still loading, or a membership that is gone, counts as read-only. Shared run links (`/share/:token/`) are governed by the link, not by roles.
- Organization, member, and ownership changes on `/dashboard/settings/` report success once the write succeeds (`src/features/teams/runTeamWrite.ts`). A refresh that fails afterwards shows "Saved, but refreshing failed" rather than an error and marks the Organization list stale, so the next focus or visit refetches it; the confirmed change (an Organization's new name, or the previous owner becoming `admin`) is applied to the cached Organization list so owner-only controls do not linger. A refused member update or ownership transfer reloads the members (a transfer also reloads the Organizations), since its `409` means another manager's change landed first, such as a new owner. A refused accept of an incoming invite (already a member, revoked, expired) reloads the incoming invites, which no longer list it.
- `/dashboard/settings/` currently combines Account, Organization, member, invite, and billing controls; issue #206 tracks their explicit separation.
- `/account` and `/dashboard/profile` are legacy redirects to `/dashboard/settings/`.

## Audit And History

Organization changes write to `audit_events` with actor, subject, resource, action, before/after/diff JSON, request id, hashed IP, user agent, and timestamp.

Every action string is listed in `src/lib/schemas/auditActions.ts`, shared by the API and the app. `buildAuditEventValues` accepts only those, and the Activity list on `/dashboard/settings/` has a label for each (`ORGANIZATION_ACTIVITY_LABELS` in `src/lib/auditLabels.ts`); an action it does not know (for example from an older deploy) is shown as words with product terms (`src/components/account/teamActivityLabels.ts`), never as a dotted id. Stored action strings are never renamed.

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
pnpm run test:run tests/unit/functions/api/teams-handler
pnpm run test:run tests/unit/components/TeamSettingsSection.test.tsx
pnpm run test:e2e -- tests/e2e/team-workspace.spec.ts
pnpm run test:e2e -- tests/e2e/team-invite-flow.spec.ts
```
