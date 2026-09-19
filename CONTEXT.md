# SERP Lists Domain

SERP Lists lets people and teams own reusable templates and execute them as runs. This glossary defines the product language used across public profiles and authenticated workspaces.

## Identity and ownership

**User**:
An authenticated human identity that can act in a Personal Workspace and belong to Teams.
_Avoid_: Profile, account, member

**Account**:
The private login, security, and personal billing record associated with a User.
_Avoid_: Workspace, profile, Team

**Workspace**:
The ownership context in which a User is currently operating. A Workspace is either Personal or a Team.
_Avoid_: Account, organization

**Personal Workspace**:
The Workspace in which a User owns and operates their personal templates and runs.
_Avoid_: Personal account, personal team

**Team**:
A shared Workspace with members and roles that can own templates and runs independently of any one member.
_Avoid_: Organization, org, organization account, team account

**Membership**:
The relationship that gives a User a role in a Team.
_Avoid_: Ownership, profile

**Team Role**:
The permission level a Membership grants inside one Team.
_Avoid_: Plan, entitlement

**Resource Owner**:
The Personal Workspace or Team that controls a template or run.
_Avoid_: Creator, editor, member

**Creator**:
The User who originally created a resource. Creator attribution does not determine current ownership.
_Avoid_: Owner

## Public identity

**Profile Owner**:
A User or Team that has a public identity and may publish templates.
_Avoid_: Organization, publisher account

**Public Handle**:
The globally unique public name claimed by one Profile Owner.
_Avoid_: Username or team slug when referring to both owner types

**Public Profile**:
The public representation of a Profile Owner and that owner's public templates.
_Avoid_: Organization page, team page, user profile when referring generically

## Templates and runs

**Template**:
A reusable definition of an SOP, checklist, audit, launch, or other repeatable process.
_Avoid_: Run, task

**Template Owner**:
The Resource Owner that currently controls a Template.
_Avoid_: Creator

**Run**:
An execution snapshot created from a Template, with progress and history independent from the source Template.
_Avoid_: Template

**Agent**:
A code agent that acts through explicitly delegated access without becoming a User, member, or Profile Owner.
_Avoid_: Agent user, machine profile

**Run Key**:
A revocable credential that authorizes an Agent to operate runs within its permitted Workspace scope.
_Avoid_: User session, agent account

## Visibility

**Public Template**:
A Template intentionally visible through its owner's Public Profile and public discovery surfaces.
_Avoid_: Shared run

**Private Template**:
A Template visible only to authorized people and agents in its owning Workspace.
_Avoid_: Unpublished draft
