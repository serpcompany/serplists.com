# Pricing and Entitlements

This document is the canonical source of truth for launch entitlement behavior.

Keep the matrix intentionally small. Add new gates only when they are needed by the product, not in anticipation of future complexity.

## Plans

Personal plans:

- `Free`
- `Pro`

Organization entitlement (legacy stored value):

- `team`

`team` is a legacy implementation value, not a Personal upgrade. It applies only while a User is operating in a paid Organization context. The UI labels it "Paid" (`getBillingPlanLabel` in `src/lib/billing.ts`).

## Core Rule

Features default to Free unless this document explicitly marks them as paid.

The API is the source of truth for plan enforcement. UI gating must match API behavior, but backend enforcement is authoritative.

## Personal Matrix

| Capability | Free | Pro |
| --- | --- | --- |
| Use the core product | Yes | Yes |
| Create personal templates | Limited | Yes |
| Keep active personal runs | Limited | Yes |
| Copy public templates into Personal | No | Yes |
| Import templates into Personal | Limited | Yes |

Current Free limits:

- 1 personal template.
- 3 active personal runs.

An active run is one in progress, whether or not it is shared. Every way of adding one counts against the limit of the
run's own context (its Organization, or its owner's Personal context), not the acting
User's: starting or restoring a run, and reopening a completed run by revalidating it,
setting its status back to in progress, through a share link, or through an agent's Run
Key. Saves to a run that is already in progress never check the limit, so a context over
its limit (for example after a downgrade) can still finish its runs
(`functions/api/utils/active-run-limit.ts`). A guest run, kept only in a signed-out
visitor's browser, belongs to no context and counts against nothing; saving it into an
account starts a run, which counts like any other ([features](features.md#runs-and-sharing)).

Limits hold under concurrent requests. Starting, restoring, reopening, and copying runs
and Templates check the count once for a clear error, then again inside the write itself
(`INSERT ... SELECT ... WHERE count < limit`, or the same condition on a restore's or a
reopen's `UPDATE`), so parallel requests cannot all pass the same count
(`functions/api/utils/guarded-insert.ts`, `functions/api/utils/template-writes.ts`).

## Organization Matrix

| Capability | Free Organization | Paid Organization |
| --- | --- | --- |
| Use the shared Organization context | Yes | Yes |
| Create Organization templates | Limited by Organization context and role | Yes, if role allows |
| Keep active Organization runs | Limited by Organization context and role | Yes, if role allows |
| Copy/import templates into an Organization | Limited by Organization context and role | Yes, if role allows |

Organization Roles still apply after entitlements pass. A paid Organization does not let a `viewer` edit Templates or start Runs.

## Personal vs Organization Entitlements

A User's Personal plan and an Organization's plan are evaluated independently.

Examples:

- Free User in Personal: Free limits apply.
- Free User in a paid Organization: paid limits apply to that Organization's Templates and Runs.
- Pro User in Personal: Pro Personal limits apply.
- Pro User in a Free Organization: Free Organization limits apply unless the Organization has a paid override.

Organization access must not upgrade or expose a User's Personal Templates, Runs, or billing status.

## Upgrade Triggers

Personal upgrade triggers:

- Copying public Templates into Free Personal after hitting the paid gate.
- Creating/importing more personal templates than Free allows.
- Keeping more active personal runs than Free allows.

Organization upgrade triggers:

- The Organization hits its Template or active-Run limits.
- An Organization member has a role that allows the action, but the Organization entitlement does not.

## Implementation Notes

- User entitlements are resolved in `functions/api/utils/entitlements.ts`.
- Organization entitlements use the legacy `team_entitlement_overrides` table and are resolved only for Organization contexts.
- Personal manual overrides use `entitlement_overrides`.
- Stripe currently backs personal Pro subscription state.
- Organization entitlement overrides are D1-backed to avoid new services or recurring cost.
- If a new paid feature is added later, update this document before spreading the rule across API handlers and UI components.

### Enforcement contract

Server-side checks are authoritative. Clients preserve structured API failures
instead of inferring access state from message text:

- `401` means the user must sign in; preserve the requested return path.
- `403 upgrade_required` means the active context needs a paid entitlement.
- `403 limit_reached` means the plan limit of the context that owns the Template or
  Run has been reached. `details` holds `limit`, `current`, `resource`
  (`active_runs` or `templates`) and `context` (`personal` or `organization`).
  Only a Personal limit tells the user to upgrade to Pro; an Organization limit
  says the Organization needs a paid plan, because Personal Pro never lifts it.
  Clients pick the upgrade path from `details.context`, not from the message:
  `getAccessFailure` in `src/lib/api-errors.ts` treats an Organization limit as a
  plain error that shows the server message and never starts Personal Pro checkout.
  All of these responses come from `functions/api/utils/limit-reached.ts`.
- `503 billing_unavailable` means checkout cannot currently be started.
- `409 already_subscribed` means the User already has Pro or a paid subscription.
- `409 subscription_needs_attention` means an open subscription is not paid up
  (`past_due`, `unpaid`, `paused`); the client opens the Customer Portal instead of
  a second Checkout.
- `409 checkout_incomplete` means an earlier checkout's first payment has not gone
  through and its Checkout Session can no longer be offered (for example, the
  payment is still processing); the client shows the message and never opens the
  Customer Portal.
- `409 plan_managed_by_support` means a manual Free override sets the Personal
  plan, so self-serve checkout is closed.
- `409 billing_customer_missing` means Stripe no longer has the User's billing
  account (deleted, or made with the other mode's keys), so the Customer Portal
  cannot open. The portal request replaces the account, as checkout does, and
  Billing refetches its status: subscriptions stored for the old account no longer
  show, so Billing offers Upgrade. While the User has an open subscription on a
  current Pro price, the account is kept and the message asks them to contact
  support, since Stripe's answer then points at misconfigured keys.
- `409 no_billing_account` means the User has no billing account (for example,
  Pro granted by support), so there is no Customer Portal to open.
- `409 checkout_in_progress` means another checkout for the User is still
  starting (a double click or a second tab); trying again shortly succeeds.

### Subscription status

Only `active` and `trialing` Stripe subscriptions grant Pro. A `past_due`,
`unpaid`, `paused`, or `incomplete` subscription resolves to Free. The first three
block a new Checkout, and Billing shows a notice with Manage subscription so the
User can fix the payment in the Customer Portal. An `incomplete` subscription is a
first payment that did not go through in Checkout (a declined card or an abandoned
3DS step), which the Customer Portal cannot pay: Billing and Pricing keep offering
Upgrade, and checkout sends the User back to the Checkout Session that holds it. Whether `past_due` should keep
Pro during Stripe's retry window is an open product decision; change it here
first if it is made.

Route `upgrade_required` and `limit_reached` through
`handleUpgradeRequiredForContext` in `src/lib/access-flow.ts` so every page
answers them the same way: Personal starts the Pro checkout, and an Organization
shows the Organization-plan message without starting a Personal checkout, since
Personal Pro does not lift Organization limits. Report each failure once. Start
Run follows this on My Templates, template detail and the public template page,
because a run always starts in the active context. Copying a template (Save on the
public template page, Copy on template detail) follows it too, because the copy
goes to the active context: Personal keeps its Pro gate and starts the Personal
checkout, and an Organization's copy is sent for the API to check against the
Organization's Template limit.

Billing status query keys must include the current user id (or an explicit
guest marker). Never reuse a cached plan between accounts, and do not render a
Free or Pro label as known while billing status is still loading. If billing
status fails to load, the plan is unknown, not Free: show "Unavailable" with a
Retry, and do not show upgrade prompts, plan gates, or subscription actions until
it loads (`getBillingPlanStatus` in `src/lib/billing.ts`). The Pricing page's Pro
card shows "Couldn't check your plan. Try again." with Retry in place of Upgrade.
Status requests retry transient failures (`shouldRetryBillingStatus`) before the
plan counts as unknown.

Feature gates read the plan through `useBillingStatus` (`src/hooks/useBillingStatus.ts`),
which reports `loading`, `error` or `known`. Only a `known` Free plan shows an
upgrade prompt or starts checkout. When the status check fails, offer a retry
and no upgrade prompt: import/export lets the action through for the server to
decide, while copying a public Template and exporting one from its detail page
(a pack built in the browser) ask the user to try again and check the plan again.

### Manual personal-plan overrides

Personal manual overrides take precedence over Stripe-derived state until they
are removed. While one is active, checkout is refused (a subscription bought under
a Free override would never grant Pro) and Billing says support manages the plan.
Billing offers Manage subscription only to a User with a Stripe billing account,
so Pro granted by support shows just that notice. Use the [admin override procedure](../SECURITY.md#admin-entitlement-override)
for prerequisites, commands, verification, and temporary-secret cleanup.
