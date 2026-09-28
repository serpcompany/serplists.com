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
- `403 limit_reached` means the active plan limit has been reached.
- `503 billing_unavailable` means checkout cannot currently be started.
- `409 already_subscribed` means the User already has Pro or a paid subscription.
- `409 subscription_needs_attention` means an open subscription is not paid up;
  the client opens the Customer Portal instead of a second Checkout.
- `409 plan_managed_by_support` means a manual Free override sets the Personal
  plan, so self-serve checkout is closed.
- `409 billing_customer_missing` means Stripe no longer has the User's billing
  account, so the Customer Portal cannot open; checkout replaces the account.
- `409 no_billing_account` means the User has no billing account (for example,
  Pro granted by support), so there is no Customer Portal to open.
- `409 checkout_in_progress` means another checkout for the User is still
  starting (a double click or a second tab); trying again shortly succeeds.

### Subscription status

Only `active` and `trialing` Stripe subscriptions grant Pro. A `past_due`,
`unpaid`, `paused`, or `incomplete` subscription resolves to Free, but it still
blocks a new Checkout, and Billing shows a notice with Manage subscription so the
User can fix the payment in the Customer Portal. Whether `past_due` should keep
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
Free or Pro label as known while billing status is still loading.

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
