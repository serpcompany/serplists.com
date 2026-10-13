# Personal and Organization contexts

Which context owns what, how a tab chooses its context, what each Organization role may do, and
how Organizations are named, joined and left.

Abbreviations: **Owner access tests** is `tests/unit/functions/api/owner-access.test.ts`,
**Organization routes spec** is `tests/e2e/organization-routes.spec.ts`,
**Route context tests** is `tests/unit/contexts/WorkspaceRouteContext.dom.test.tsx`,
**Multi-tab spec** is `tests/e2e/workspace-multi-tab.spec.ts`,
**Organizations error spec** is `tests/e2e/workspace-teams-error.spec.ts`,
**Role tests** is `tests/unit/functions/api/team-access.test.ts`,
**Organization roles spec** is `tests/e2e/organization-roles.spec.ts`,
**Switcher tests** is `tests/unit/components/workspace/WorkspaceSwitcherRoutes.dom.test.tsx`,
**Account menu tests** is `tests/unit/components/AccountMenu.dom.test.tsx`,
**Name limit tests** is `tests/unit/lib/schemas/nameLimits.test.ts`,
**Organization settings tests** is `tests/unit/components/TeamSettingsSection.test.tsx`,
**Organization profile settings spec** is `tests/e2e/organization-profile-settings.spec.ts`,
**Organization profile store tests** is `tests/unit/functions/api/teams-sqlite.profile.test.ts`,
**Handle rule tests** is `tests/unit/lib/publicHandle.test.ts`,
**Handle registry tests** is `tests/unit/functions/public-handles-migration.test.ts`,
**Username save tests** is `tests/unit/functions/api/better-auth-username-update.test.ts`,
**Organization profile spec** is `tests/e2e/organization-public-profile.spec.ts`,
**Username conflict spec** is `tests/e2e/account-username-conflict.spec.ts`,
**Organization conflicts spec** is `tests/e2e/team-settings-conflicts.spec.ts`,
**Invite spec** is `tests/e2e/team-invite-flow.spec.ts`,
**Organization audit tests** is `tests/unit/functions/api/teams-handler.settings.test.ts`, and
**Template history tests** is `tests/unit/functions/api/templates-handler.history.test.ts`.

## Who owns what

**Personal and Organizations.** Users always have a Personal context and can belong to
Organizations. Organization-owned Templates and Runs are shared with active Organization members,
by role; a Personal Template or Run belongs to its owner alone.

- Check: Owner access tests, "gives an Organization run to its active members by role, and a
  personal run to its owner only" and "gives a Template the Organization owns to its active
  members by role".

## Choosing a context

**The URL decides.** A Personal URL always shows Personal and an Organization URL that
Organization, and every link names the context it means.

- Check: Organization routes spec, "a Personal URL shows Personal in a tab that remembered an
  Organization, and becomes the remembered context" and "an Organization URL opens that
  Organization's Templates in a tab that remembered Personal, and a reload keeps it".

**The remembered context.** Context switching is available from the dashboard shell and persists
locally: the remembered context is the last one a tab opened. It chooses only where `/dashboard`
lands and the context of pages outside the console.

- Check: Route context tests, "shows the Organization it names, whatever the tab remembered, and
  becomes the remembered context" and "keeps the tab's last Organization on a page outside the
  console".

**Other tabs.** Switching in one tab does not switch tabs that are already open.

- Check: Multi-tab spec, "a Personal tab stays Personal after another tab selects an
  Organization".

**Switching on a console page.** Switching opens the same section in the chosen context (a
Template or Run page opens the other context's list), after the page's unsaved-changes question.

- Check: Route context tests, "goes from an Organization Run to the Personal Runs list, in
  Personal" and "changes nothing when the user keeps the unsaved work the page asked about".

## When the Organization list fails

**An error, not Personal.** If the Organization list fails to load, the app shows an error with
Retry (or Continue in Personal) instead of switching to Personal. Console pages show it in place
of the page.

- Check: Organizations error spec, "the dashboard home waits on a failed teams request with an
  error instead of opening Personal's Templates, and Retry opens the remembered Organization" and
  "Continue in Personal leaves the dashboard home's error for Personal's Templates".

**The public template page.** The public template page keeps the template readable and shows the
error above it, with Start Run and Save disabled until the list loads or the user continues in
Personal.

- Check: Organizations error spec, "the public template page offers Retry when the teams request
  fails" and "the public template page can continue in Personal when the teams request fails".

**Personal keeps working.** Personal keeps working when the list fails, but the context switcher
and Settings say the Organizations couldn't load and offer Retry instead of showing no
Organizations.

- Check: Organizations error spec, "a Personal URL shows Personal while the teams request fails,
  and the switcher offers a retry".

**Records of an Organization.** An Organization's Run or private Template opened at a Personal URL
moves to its Organization's URL, which shows the error until the list loads.

- Check: Organizations error spec, "a Personal URL for an Organization run moves to the
  Organization's URL, which waits for a failed teams request with Retry".

## Roles

**What each role may do.** Each Organization member has one role:

| Role | May |
| --- | --- |
| `owner` | Full Organization management and ownership transfer |
| `admin` | Manage Organization settings, members, and invites |
| `editor` | Edit Organization Templates and start Runs |
| `runner` | Start and work through Runs |
| `viewer` | Read only |

- Check: Role tests, "orders team capabilities by role".

**Only allowed actions.** The UI offers only the actions the member's role allows in the
Organization that owns the Template or Run ([Organizations](../agents/organizations.md#ui-flow)).

- Check: Organization roles spec, "an Organization viewer sees no actions the API would reject"
  and "an Organization runner can run but not edit or delete".

## Managing an Organization

**Where.** Organization management lives only on the Organization's own settings,
`/dashboard/organization/:organizationId/settings`, which the switcher's Settings opens in that
Organization.

- Check: Switcher tests, "names the Organization the URL names and links Settings to that
  Organization's settings" and "names Personal whatever the tab remembered, and links Settings to
  Personal settings".

The account menu's Settings opens Personal settings.

- Check: Account menu tests, "opens My Templates and My Runs in the Organization the tab is in,
  and Settings in Personal, where the account's settings live".

**Name.** Organization names are limited to 120 characters, counted after trimming
(`src/lib/schemas/nameLimits.ts`, matching the API), and a longer name gets a clear message
instead of the API's schema error.

- Check: Name limit tests, "explains an empty or too long name, measured after trimming".

The Organization name fields stop at the limit.

- Check: Organization settings tests, "stops typing an Organization name at the limit the API
  accepts, rather than letting the API refuse it with a raw schema error".

**Avatar and description.** Owners and admins give an Organization an avatar and a description on
its settings page. The avatar saves as soon as it is uploaded or removed, as the account avatar
does; the description saves with the name and slug.

- Check: Organization profile settings spec, "an Organization's owner saves its description and
  avatar on its settings page, and both stay after a reload".

The description is plain text of at most 500 characters, and clearing it removes it. An avatar
must be an upload to SERP Lists.

- Check: Organization profile store tests, "clears the description with an empty one and the
  avatar with null, and writes nothing when neither changes" and "refuses an avatar hosted
  anywhere but SERP Lists' uploads, and a description over 500 characters, saving neither".

Other members see the avatar there without the controls.

- Check: Organization settings tests, "shows a member who cannot manage the Organization its
  avatar, without the controls owners and admins get".

**Leaving.** Members other than the owner can leave an Organization from its settings, which then
opens Personal settings.

- Check: Invite spec, "team invite flow asks before joining through a link, lets members leave,
  and works from account settings".

**History.** Organization changes are recorded in D1-backed audit tables.

- Check: Organization audit tests, "updates team profile fields for team admins and records audit
  history".

Template changes are recorded in D1-backed history tables, each version with its audit event.

- Check: Template history tests, "returns template history to active team members, each version
  with the metadata of its audit event, and the events with them".

## Handles

**One rule.** Usernames and Organization slugs follow one rule: 3 to 30 letters, digits, `_`, `.`
and `-`.

- Check: Handle rule tests, "accepts %j" and "refuses %j".

**One namespace.** They share one namespace compared without regard to case: a username can't be
another User's in a different case or an Organization's slug, and an Organization slug can't be a
username ([public handle registry](../agents/database-operations.md#public-handle-registry)).

- Check: Handle registry tests, "refuses an Organization slug that is a User's handle in any case,
  and a username that is an Organization's, writing nothing" and "refuses two Users or two
  Organizations whose handles differ only in case".

**Letter case.** Usernames are stored lowercase.

- Check: Username save tests, "saves a free username and a name-only change" and "lets an account
  re-save its own username with different case".

Organization slugs keep the case they are typed in.

- Check: Organization profile spec, "an Organization's Public Profile shows its name, handle and
  description, and opens its public Template under its handle".

**Taken.** A username another account holds, in any letter case, reads "Username is already
taken. Please try another."

- Check: Username conflict spec, "saving a username another account has says it is taken instead
  of failing the update".

An Organization slug in use reads "Organization slug is already in use".

- Check: Organization conflicts spec, "creating an Organization with a taken slug shows the
  conflict and keeps the form".

## Invites

**Links.** Organization invites are link-based today. A link is shown once; managers can replace a
lost one with **New link** on the pending invite, which stops the previous link from working.

- Check: Invite spec, "a manager who lost an invite link can replace it, and the old link stops
  working".

**Accepting.** The invite link (`/team-invites/:token`) and incoming invites on
`/dashboard/settings` both accept an invite. The link page shows the Organization, inviter, and
role and waits for **Accept invite** or **Decline**; accepting does not switch the active context.

- Check: Invite spec, "team invite flow asks before joining through a link, lets members leave,
  and works from account settings".
