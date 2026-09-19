# Product Plans

This document is the canonical source of truth for launch entitlement behavior.

Keep the matrix intentionally small. Add new gates only when they are needed by the product, not in anticipation of future complexity.

## Plans

Personal account plans:

- `Free`
- `Pro`

Team workspace entitlement:

- `team`

`team` is not a personal account upgrade. It applies only while a user is operating inside a paid team workspace.

## Core Rule

Features default to Free unless this document explicitly marks them as paid.

The API is the source of truth for plan enforcement. UI gating must match API behavior, but backend enforcement is authoritative.

## Personal Workspace Matrix

| Capability | Free | Pro |
| --- | --- | --- |
| Use the core product | Yes | Yes |
| Create personal templates | Limited | Yes |
| Keep active personal runs | Limited | Yes |
| Copy public templates into personal workspace | No | Yes |
| Import templates into personal workspace | Limited | Yes |

Current Free limits:

- 1 personal template.
- 3 active personal runs.

## Team Workspace Matrix

| Capability | Free team | Paid team |
| --- | --- | --- |
| Use shared team workspace | Yes | Yes |
| Create team templates | Limited by team context and role | Yes, if role allows |
| Keep active team runs | Limited by team context and role | Yes, if role allows |
| Copy/import templates into team workspace | Limited by team context and role | Yes, if role allows |

Team roles still apply after entitlements pass. A paid team does not let a `viewer` edit templates or start runs.

## Personal vs Team Entitlements

A user's personal plan and a team's plan are evaluated independently.

Examples:

- Free user in personal workspace: Free limits apply.
- Free user in paid team workspace: paid team limits apply to that team's templates/runs.
- Pro user in personal workspace: Pro personal limits apply.
- Pro user in Free team workspace: Free team limits apply to that team unless the team has a paid override.

Team access must not upgrade or expose a user's personal templates, runs, or billing status.

## Upgrade Triggers

Personal upgrade triggers:

- Copying public templates into a Free personal workspace after hitting the paid gate.
- Creating/importing more personal templates than Free allows.
- Keeping more active personal runs than Free allows.

Team upgrade triggers:

- Team workspace hits team-context template or active-run limits.
- Team member has a role that allows the action, but the active team entitlement does not.

## Implementation Notes

- User entitlements are resolved in `functions/api/utils/entitlements.ts`.
- Team entitlements use `team_entitlement_overrides` and are resolved only for team contexts.
- Personal manual overrides use `entitlement_overrides`.
- Stripe currently backs personal Pro subscription state.
- Team entitlement overrides are D1-backed to avoid new services or new recurring cost.
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
Free or Pro label as known while billing status is still loading.

### Manual personal-plan overrides

Personal manual overrides take precedence over Stripe-derived state until they
are removed. Use the [admin override runbook](../knowledge/entitlements-admin-override.md)
for prerequisites, commands, verification, and temporary-secret cleanup.
