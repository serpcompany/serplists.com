# Pricing and Entitlements

What Free, Pro and a paid Organization include, how each limit counts, and how the API and the
pages answer a plan gate. Checkout, the Customer Portal and the plan's status are in
[Billing and checkout](billing-and-checkout.md).

Abbreviations: **Billing status tests** is `tests/unit/lib/billing.test.ts`,
**Limit message tests** is `tests/unit/functions/api/limit-messages.test.ts`,
**Active run limit tests** is `tests/unit/functions/api/active-run-limit.test.ts`,
**Template copy tests** is `tests/unit/functions/api/templates-handler.clone.test.ts`,
**Backup API tests** is `tests/unit/functions/api/templates-handler.backup.test.ts`,
**Import page tests** is `tests/unit/components/TemplateBackup.test.tsx`,
**Limit guard tests** is `tests/unit/functions/api/plan-limit-guards.test.ts`,
**Reopen on D1 tests** is `tests/unit/functions/api/checklists-reopen-limit-d1.test.ts`,
**Reopen limit tests** is `tests/unit/functions/api/checklists-reopen-limit.test.ts`,
**Guest run save tests** is `tests/unit/features/guest-runs/saveGuestRunToAccount.test.ts`,
**Organization copy API tests** is `tests/unit/functions/api/templates-clone-organization.test.ts`,
**Entitlement tests** is `tests/unit/functions/api/entitlements.test.ts`,
**Subscription guard tests** is `tests/unit/functions/api/billing-subscription-guard.test.ts`,
**Public template actions spec** is `tests/e2e/public-template-actions.spec.ts`,
**Template limit spec** is `tests/e2e/template-limit.spec.ts`,
**My Templates spec** is `tests/e2e/dashboard-templates.spec.ts`,
**Access flow tests** is `tests/unit/lib/access-flow.test.ts`,
**API error tests** is `tests/unit/lib/api-errors.test.ts`,
**Template actions tests** is `tests/unit/features/template-detail/useTemplateDetailModel.actions.test.ts`,
and **Organization copy tests** is `tests/unit/features/template-detail/organizationCopy.test.ts`.

This document is the canonical source of truth for launch entitlement behavior. Keep the matrix
intentionally small. Add new gates only when they are needed by the product, not in anticipation
of future complexity.

## Plans

Personal plans are `Free` and `Pro`. An Organization is Free, or paid through the Organization
entitlement, stored as the legacy value `team`.

**The Organization plan.** `team` is a legacy implementation value, not a Personal upgrade. It
applies only while a User is operating in a paid Organization context. The UI labels it "Paid"
(`getBillingPlanLabel` in `src/lib/billing.ts`).

- Check: Billing status tests, "does not treat an unknown billing plan as free".

## Core Rule

Features default to Free unless this document explicitly marks them as paid.

The API is the source of truth for plan enforcement. UI gating must match API behavior, but
backend enforcement is authoritative.

## Personal Matrix

| Capability | Free | Pro |
| --- | --- | --- |
| Use the core product | Yes | Yes |
| Create personal templates | Limited | Yes |
| Keep active personal runs | Limited | Yes |
| Copy public templates into Personal | No | Yes |
| Import and export templates | No | Yes |

**Free limits.** Free allows 1 personal template and 3 active personal runs. Creating or restoring
a Template, copying one into an Organization, and starting, restoring or reopening a run, past a
limit answers `403 limit_reached`, its `details` naming the `limit`, the `current` count, the
`resource` (`active_runs` or `templates`) and the `context` (`personal` or `organization`).

- Check: Limit message tests, "limit_reached names the context whose limit was hit, and offers Pro
  only for a Personal one, since Personal Pro never lifts an Organization limit".

**Pro.** Pro has no template or active-run limit.

- Check: Active run limit tests, "skips the count on plans without a limit".

**Copying into Personal.** Copying a public Template into Personal needs Pro whatever the count:
Free gets `403 upgrade_required`, and nothing is read or written.

- Check: Template copy tests, "asks %s to upgrade before copying into Personal, and reads or writes
  nothing".

**Import and export.** Template import and export need Pro in Personal and a paid plan in an
Organization; otherwise the API answers `403 upgrade_required`.

- Check: Backup API tests, "should reject template backup export for free users" and "should
  import templates from backup for pro users".

The import page says import and export are a Pro feature, with Upgrade to Pro, and keeps its file
input and Export off, on a plan known to be Free.

- Check: Import page tests, "still shows the upgrade banner when the plan is known to be Free" and
  "enables import and export for a known Pro plan".

**Active runs.** An active run is one in progress, whether or not it is shared.

- Check: Active run limit tests, "counts shared runs like any other active run".

**Whose limit.** Every way of adding an active run counts against the limit of the run's own
context (its Organization, or its owner's Personal context), not the acting User's
(`functions/api/utils/active-run-limit.ts`).

- Check: Active run limit tests, "uses the Organization plan for Organization runs", "counts an
  Organization's in-progress runs by Organization only" and "counts a Personal context by owner
  outside any Organization".

**Starting and restoring.** Starting or restoring a run counts, through an agent's Run Key too.

- Check: Limit guard tests, "run create answers 403 and uses only guarded inserts", "run restore
  answers 403 when the guarded update restores nothing at the limit" and "MCP start_run answers
  limit_reached".

**Reopening.** Reopening a completed run counts, whether it is revalidated, set back to in
progress, reopened through a share link, or through an agent's Run Key.

- Check: Reopen on D1 tests, "reopens it into the last free active run and records it once".

**Saves.** Saves to a run that is already in progress never check the limit, so a context over its
limit (for example after a downgrade) can still finish its runs.

- Check: Reopen limit tests, "keeps saving an in-progress run at (or over) the limit without
  checking it" and "lets a share-link guest keep saving an in-progress run without checking the
  limit".

**Guest runs.** A guest run, kept only in a signed-out visitor's browser, belongs to no context
and counts against nothing. Saving it into an account starts a run, which counts like any other
([Guest runs](guest-runs.md#saving-into-an-account)).

- Check: Guest run save tests, "asks for an upgrade, and keeps the guest run, when the Personal
  plan has no room for another active run" and "says why, and keeps the guest run, when the
  Organization's plan has no room".

**Concurrent requests.** Limits hold under concurrent requests. Starting, restoring, reopening,
and copying runs and Templates check the count once for a clear error, then again inside the
write itself (`INSERT ... SELECT ... WHERE count < limit`, or the same condition on a restore's
or a reopen's `UPDATE`), so parallel requests cannot all pass the same count
(`functions/api/utils/guarded-insert.ts`, `functions/api/utils/template-writes.ts`).

- Check: Reopen on D1 tests, "refuses it with limit_reached when a concurrent reopen took the last
  active run after its count, inside the write".

The writes that lose the race answer `403 limit_reached`, never success.

- Check: Limit guard tests, "limit-guarded writes that lose the race to another request answer 403
  limit_reached, never success".

## Organization Matrix

| Capability | Free Organization | Paid Organization |
| --- | --- | --- |
| Use the shared Organization context | Yes | Yes |
| Create Organization templates | Limited by Organization context and role | Yes, if role allows |
| Keep active Organization runs | Limited by Organization context and role | Yes, if role allows |
| Copy templates into an Organization | Limited by Organization context and role | Yes, if role allows |
| Import and export templates | No | Yes, if role allows |

**Free Organization limits.** A Free Organization has the Free limits, 1 template and 3 active
runs. A copy into it goes through while it is under its Template limit.

- Check: Organization copy API tests, "copies into a Free Organization that is under its Template
  limit" and "reports limit_reached once the Free Organization is at its limit".

**Roles still apply.** Organization Roles still apply after entitlements pass. A paid
Organization does not let a `viewer` edit Templates or start Runs.

- Check: Organization copy API tests, "refuses a role that cannot add Templates to the
  Organization".

## Personal vs Organization Entitlements

A User's Personal plan and an Organization's plan are evaluated independently, and Organization
entitlements apply only inside the selected Organization context. Examples:

| User | Context | Limits |
| --- | --- | --- |
| Free | Personal | Free |
| Free | A paid Organization | Paid for its Templates and Runs; Personal stays Free |
| Pro | Personal | Pro |
| Pro | A Free Organization | Free, unless the Organization has a paid override |

- Check: Entitlement tests, "resolves premium team context from a team override without upgrading
  the user".

**Nothing leaks across.** Organization access must not upgrade or expose a User's Personal
Templates, Runs, or billing status.

- Check: Subscription guard tests, "never exposes Personal subscription details in an
  Organization context".

## Upgrade Triggers

**Personal.** Copying a public Template into Free Personal (Save on the public template page)
leads to the upgrade.

- Check: Public template actions spec, "a Free Personal user sees that Save leads to an upgrade".

Creating more personal Templates than Free allows, from the editor or with Duplicate, leads to the
upgrade.

- Check: Template limit spec, "offers the upgrade in the editor in one message, and keeps the
  draft across checkout" and "Duplicate on a template offers the upgrade".

Keeping more active personal runs than Free allows leads to the upgrade: Start Run at the limit
opens checkout.

- Check: My Templates spec, "Start Run at the run limit opens checkout instead of only toasting".

Import and export on Free lead to the upgrade: the import page offers Upgrade to Pro.

- Check: Import page tests, "still shows the upgrade banner when the plan is known to be Free".

**Organization.** The Organization hits its Template or active-Run limits, or a member's role
allows an action that the Organization's plan does not. The message says the Organization needs a
paid plan, never Pro.

- Check: Limit message tests, "limit_reached names the context whose limit was hit, and offers Pro
  only for a Personal one, since Personal Pro never lifts an Organization limit".

## How pages answer a gate

**The context decides the path.** Clients pick the upgrade path from `details.context`, not from
the message: `getAccessFailure` in `src/lib/api-errors.ts` treats an Organization limit as a plain
error that shows the server message and never starts Personal Pro checkout. All of these
responses come from `functions/api/utils/limit-reached.ts`.

- Check: API error tests, "keeps a Personal limit, or one with no context, as upgrade_required"
  and "maps an Organization limit to a plain error, never to a Pro checkout".

**One handler.** Route `upgrade_required` and `limit_reached` through
`handleUpgradeRequiredForContext` in `src/lib/access-flow.ts` so every page answers them the same
way: Personal starts the Pro checkout, and an Organization shows the Organization-plan message
without starting a Personal checkout, since Personal Pro does not lift Organization limits.
Report each failure once.

- Check: Access flow tests, "starts a Personal checkout in the Personal context", "shows the
  Organization plan message and never starts a Personal checkout" and "reports billing as
  unavailable once when billing is disabled".

**Start Run.** Start Run follows this on My Templates, template detail and the public template
page, because a run always starts in the active context.

- Check: Template actions tests, "returns an error, not upgrade_required, when an Organization
  limit blocks a run" and "still returns upgrade_required when a Personal limit blocks a run".

**Copies.** Copying a template (Save on the public template page, Copy on template detail) follows
it too, because the copy goes to the active context: Personal keeps its Pro gate and starts the
Personal checkout, and an Organization's copy is sent for the API to check against the
Organization's Template limit.

- Check: Organization copy tests, "still asks a Free Personal user to upgrade before copying" and
  "lets the API decide instead of blocking a Free Organization in the browser".

## Implementation Notes

User entitlements are resolved in `functions/api/utils/entitlements.ts`. Organization
entitlements use the legacy `team_entitlement_overrides` table and are resolved only for
Organization contexts; Personal manual overrides use `entitlement_overrides`
([Billing and checkout](billing-and-checkout.md#manual-personal-plan-overrides)). Stripe currently
backs personal Pro subscription state, and Organization entitlement overrides are D1-backed to
avoid new services or recurring cost.

If a new paid feature is added later, update this document before spreading the rule across API
handlers and UI components.
