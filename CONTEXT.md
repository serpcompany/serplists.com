# SERP Lists

People and Organizations own reusable Templates (SOPs, checklists, audits, launches) and run them
as Runs, each with its own progress and history.

Only the terms that are easy to confuse are here, each with what it means and what it isn't. Add
one when a real confusion is resolved and getting it wrong would cause a product or architecture
mistake. The product's principles and how to write its copy are in
[`docs/product/principles.md`](docs/product/principles.md); what each page does is in
[`docs/product/`](docs/product/index.md).

## Owners and contexts

**Personal**:
The ownership context in which a User owns Templates and Runs directly. Capitalized as a
context's name: "Switch to Personal".
_Avoid_: Personal workspace, personal Organization, personal Team

**Organization**:
An owner of Templates and Runs with members and roles, apart from any one User
([ADR 0001](docs/adr/0001-use-personal-and-organization-ownership-contexts.md)). The code calls it
a team (below).
_Avoid_: Team, Workspace, org

**Ownership Context**:
The Personal or Organization context a User is acting in, which decides whose Templates, Runs and
plan apply. The console's URL decides it: a page under `/dashboard/organization/:organizationId/`
is that Organization's, any other console page Personal, and a bare `/dashboard/` opens the
remembered context. The switcher says "Switch context".
_Avoid_: Workspace, account

**Account**:
A User's private sign-in, security and Personal billing settings. Not an Organization, and not
the User's Public Profile.
_Avoid_: Organization, profile

**Template Owner**:
The User (for a Personal Template) or the Organization that controls a Template now. A public
Template's URL carries the Template Owner's handle. Transfer to Organization changes it.
_Avoid_: Creator

**Creator**:
The User who created a Template or Run. Creating it grants nothing afterwards: an Organization's
Templates are managed through its members' roles, and a Creator who leaves loses access.
_Avoid_: Owner

**Organization Role**:
What a membership allows in one Organization: `owner`, `admin`, `editor`, `runner` or `viewer`.
The `owner` role is not the Template Owner, and a role is not a plan.
_Avoid_: Plan, entitlement

**Pro** and **Paid**:
Pro is the Personal subscription, and it never applies inside an Organization. Paid is an
Organization's paid plan, stored as the plan value `team`.
_Avoid_: Team plan, Pro (for an Organization)

## Templates and Runs

**Template**:
A reusable definition of a process: its sections, tasks, Sub-tasks and blocks. Editing it never
rewrites a completed Run.
_Avoid_: Run, task

**Run**:
One execution of a Template: a snapshot of its content with its own progress, notes, answers and
Activity. Template edits reach an active private Run by stable ids. The code and the API call it a
checklist run (`checklist_runs`, `/api/checklists/:id`).
_Avoid_: Template, checklist

**Guest run**:
A Run of a public Template by someone signed out, kept only in that browser at
`/profile/:handle/:slug/run/` until they save it to an account, where it becomes a Run.
_Avoid_: shared run

**Shared run**:
A Run opened through its share link, `/share/:token/`. Anyone with the link can tick tasks, write
notes and complete it, but never rename or delete it, so it is not read-only. Sharing a Run is not
making a Template public.
_Avoid_: public run, read-only run

**Deleted** and **archived**:
A Template or Run a person deletes is archived by the API (`deleted_at`), and the console's
Archive lists it for restoring. The UI names the action Delete. An Organization is archived
instead (`archived_at`): it keeps its handle, and its profile and public Templates answer 404.
_Avoid_: Archive (as the name of the delete action)

**Activity**:
The history of a Template or Run on its page. The API calls it history
(`/api/templates/:id/history`).
_Avoid_: Changelog

**Template Library**:
The public page at `/templates/` that lists public Templates. Not My Templates, the console's list
of one context's Templates.
_Avoid_: Discover, Discover Templates, Browse Templates

**Public Template** and **Private Template**:
A public Template is shown on its owner's Public Profile, in the Template Library and in the
sitemaps, at `/profile/:handle/:slug/`. A private one is seen only by the people and Run Keys
acting for its Template Owner.
_Avoid_: unpublished draft, shared run

## Public identity

**Public Handle**:
The name in `/profile/:handle/`, from one namespace Users and Organizations share, compared
without regard to case ([ADR 0004](docs/adr/0004-share-one-namespace-for-public-handles.md)). A
User's handle is their username, and an Organization's is its slug.
_Avoid_: username or Organization slug, when meaning both

**Template slug**:
The last part of a public Template's URL, `/profile/:handle/:slug/`, unique across all Templates.
Not a handle.

**Profile Owner**:
A User with a username, or an active Organization with a slug: the owners with a Public Profile.
The Profiles directory, `/profiles/`, lists them as People and Organizations.
_Avoid_: Publisher account, Teams

## Agents

**Agent**:
A code agent, such as Claude Code or Codex, acting through a Run Key. Never a User, member or
Profile Owner.
_Avoid_: agent user, machine profile

**Run Key**:
A revocable credential an Agent sends to `/api/mcp` as `Authorization: Bearer slrk_...`. It
reaches its User's Personal Templates and Runs with the permissions chosen when it was created,
which can't be changed. The code calls it a Personal Run Key (`personal_run_keys`).
_Avoid_: User session, agent account

## Legacy names in the code

Identifiers, tables, routes and storage keys keep older names (TD-5 in
[`docs/tech-debt.md`](docs/tech-debt.md)). They never reach what users read, and ESLint flags Team
and Workspace in UI copy.

| In the code | Means |
| --- | --- |
| `team`, `teams`, `team_id`, `team_members`, `team_invites`, `owner_type = 'team'` | Organization |
| `owner_type = 'user'` | Personal |
| `workspace` (`WorkspaceContext`, `serplists.activeWorkspaceId`) | Ownership Context |
| `checklist_runs`, `/api/checklists`, `ChecklistRun` | Run |
| `ChecklistTemplate` | Template |
| The plan value `team` | Paid |
