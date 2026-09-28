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

Billing status query keys must include the current user id (or an explicit
guest marker). Never reuse a cached plan between accounts, and do not render a
Free or Pro label as known while billing status is still loading. If billing
status fails to load, the plan is unknown, not Free: show "Unavailable" with a
Retry, and do not show upgrade prompts, plan gates, or subscription actions until
it loads (`getBillingPlanStatus` in `src/lib/billing.ts`).

### Manual personal-plan overrides

Personal manual overrides take precedence over Stripe-derived state until they
are removed. Use the [admin override procedure](../SECURITY.md#admin-entitlement-override)
for prerequisites, commands, verification, and temporary-secret cleanup.
