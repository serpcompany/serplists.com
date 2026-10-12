# Product principles

What every page and endpoint of SERP Lists keeps to, and how its copy is written. The terms are
in [`CONTEXT.md`](../../CONTEXT.md), and what each page does today is in the
[product docs](index.md). Product wording and pricing change only with the owner's approval.

## Principles

- **Ownership is explicit.** Everything belongs to one owner: a User acting in Personal, or an
  Organization. Access to an Organization never shows or upgrades a User's Personal Templates,
  Runs or plan.
- **Runs are snapshots.** A Run keeps its own progress and history. Template edits reach active
  private Runs by stable ids and never rewrite completed work.
- **Features are Free unless the pricing spec says otherwise.** Keep the entitlement matrix small,
  and add a gate only when the product needs one
  ([pricing and entitlements](pricing-and-entitlements.md)).
- **The API decides access.** The UI shows what the API allows, but it is never where access is
  enforced.
- **Say it the same way everywhere.** UI copy, API messages and docs use the terms in
  [`CONTEXT.md`](../../CONTEXT.md).

## Writing product copy

- Capitalize Personal and Organization when they name an ownership context: "Switch to
  Personal", "Organization settings", "Create Organization".
- Label a paid Organization's plan "Paid". The stored plan value `team` is a legacy name.
- Call `/templates/` the Template Library: "Template Library" in navigation and headings, and
  "Browse the Template Library" on buttons. ESLint flags its old names (Discover, Discover
  Templates, Browse Templates) in UI code; prose such as "browse public templates" is fine.
- Ordinary English "team", a group of people, is fine in marketing copy, but Team and Workspace
  never mean an Organization or an ownership context. ESLint flags a capitalized Team or
  Workspace in UI code, and "workspace" in prose in any case, but not a lowercase "team".
- Name an action by what the user sees happen: the UI says Delete, though the API archives what
  is deleted, and the console's Archive restores it.
- The Profiles directory lists People and Organizations, never Teams.
