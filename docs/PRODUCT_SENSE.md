# Product Sense

SERP Lists lets people and Organizations own reusable Templates (SOPs, checklists,
audits, launches) and execute them as Runs with their own progress and history.
Public Templates are published through Public Profiles; code agents can write
private Templates and operate Runs through revocable Run Keys. What exists today is specified in
[product-specs/](product-specs/index.md).

## Principles

- **Ownership is explicit.** Everything belongs to a Resource Owner: a User acting
  Personally or an Organization. Organization access never exposes or upgrades a
  User's Personal Templates, Runs, or plan.
- **Runs are snapshots.** A Run keeps its own progress and history; Template edits
  reconcile into active private Runs by stable ids and never rewrite completed work.
- **Features are Free unless the pricing spec says otherwise.** Keep the entitlement
  matrix small and add gates only when the product needs them
  ([pricing and entitlements](product-specs/pricing-and-entitlements.md)).
- **The API decides access.** UI gates mirror API behavior but are never the
  enforcement point.
- **Say it the same way everywhere.** Use the glossary below in UI copy, API
  messages, docs, and code comments.

## Glossary

The product language used across public profiles and the authenticated console.

### Identity and ownership

**User**:
An authenticated human identity that can own personal resources and belong to Organizations.
_Avoid_: Profile, account, member

**Account**:
The private login, security, and personal billing record associated with a User.
_Avoid_: Organization, profile

**Personal**:
The default ownership context in which a User directly owns templates and runs.
_Avoid_: Personal Workspace, personal Organization, personal Team

**Organization**:
A shared resource owner with members and roles that can own templates and runs independently of any one User.
_Avoid_: Team, Workspace, org, Team account

**Organization Membership**:
The relationship that gives a User a role in an Organization.
_Avoid_: Team membership, ownership, profile

**Organization Role**:
The permission level an Organization Membership grants inside one Organization.
_Avoid_: Plan, entitlement

**Ownership Context**:
The Personal or Organization context a User is currently acting in. It decides which templates, runs, and entitlements apply. The console's switcher is labeled "Switch context".
_Avoid_: Workspace, account

**Resource Owner**:
The User acting Personally or the Organization that controls a template or run.
_Avoid_: Creator, editor, member

**Creator**:
The User who originally created a resource. Creator attribution does not determine current ownership.
_Avoid_: Owner

### Public identity

**Profile Owner**:
A User or Organization that has a public identity and may publish templates.
_Avoid_: Publisher account

**Public Handle**:
The globally unique public name claimed by one Profile Owner.
_Avoid_: Username or Organization slug when referring to both owner types

**Public Profile**:
The public representation of a Profile Owner and that owner's public templates.
_Avoid_: Organization page, team page, user profile when referring generically

### Templates and runs

**Template**:
A reusable definition of an SOP, checklist, audit, launch, or other repeatable process.
_Avoid_: Run, task

**Template Owner**:
The Resource Owner that currently controls a Template.
_Avoid_: Creator

**Template Library**:
The public discovery surface at `/templates/` that lists Public Templates.
_Avoid_: Discover, Discover Templates, Browse Templates

**Run**:
An execution snapshot created from a Template, with progress and history independent from the source Template.
_Avoid_: Template

**Agent**:
A code agent that acts through explicitly delegated access without becoming a User, member, or Profile Owner.
_Avoid_: Agent user, machine profile

**Run Key**:
A revocable credential that authorizes an Agent to do what its permissions allow (read or write templates, read or write runs) within its permitted Personal or Organization scope. Permissions are chosen when the key is created and cannot be changed.
_Avoid_: User session, agent account

### Visibility

**Public Template**:
A Template intentionally visible through its owner's Public Profile and public discovery surfaces.
_Avoid_: Shared run

**Private Template**:
A Template visible only to authorized people and agents acting for its Resource Owner.
_Avoid_: Unpublished draft

## Writing product copy

- Capitalize Personal and Organization when naming an Ownership Context: "Switch to Personal", "Organization settings", "Create Organization".
- Label a paid Organization's plan "Paid". The stored plan value `team` is a legacy implementation detail.
- Call `/templates/` the Template Library: "Template Library" where it is a navigation label or a heading, "Browse the Template Library" on buttons. ESLint flags its old names in UI code (Discover, Discover Templates, Browse Templates); prose such as "browse public templates" is fine.
- Ordinary English "team" (a group of people) is fine in marketing copy, but never use Team or Workspace to mean an Organization or an Ownership Context. ESLint enforces this in UI code: it flags a capitalized Team or Workspace, and "workspace" in prose in any case, the retired term, but not a lowercase "team".
