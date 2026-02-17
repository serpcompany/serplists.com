# Free/Basic/Pro Implementation TODO

This checklist tracks all work needed to fully implement and operate plan tiers with consistent behavior across billing, backend enforcement, UI, testing, and docs.

## Phase 0: Product and plan definition
- [ ] Finalize the feature matrix for `free`, `basic`, and `pro` in one source document (`docs/product/plans.md`).
- [ ] Define limit values per tier (for example: max templates, max active runs, import/export access, marketplace save access).
- [ ] Confirm which features are boolean gates vs numeric limits.
- [ ] Confirm plan display names and internal plan keys (`free`, `basic`, `pro`).
- [ ] Define downgrade behavior for users who exceed new lower-tier limits.
- [ ] Define upgrade prompts and copy for each blocked action.
- [ ] Add documentation for business rules and edge cases (grandfathering, trial behavior, cancellation timing).

## Phase 1: Entitlements architecture and data model
- [ ] Create a single machine-readable entitlements catalog (typed config, not scattered constants).
- [ ] Add shared types for plan keys, feature keys, and limit keys.
- [ ] Refactor entitlement resolution to read from the shared catalog.
- [ ] Add `basic` support to entitlement overrides (`entitlement_overrides.plan`) and related validation.
- [ ] Add DB migration(s) if constraints or allowed plan values need to change.
- [ ] Keep legacy `pro` behavior stable while introducing `basic`.
- [ ] Add/update docs for the entitlements architecture.

## Phase 2: Stripe and billing mapping
- [ ] Create/update Stripe products and prices for `basic` and `pro` (monthly/yearly if used).
- [ ] Add a centralized Stripe `price_id -> plan_key` mapping.
- [ ] Update env vars for all active Stripe price IDs.
- [ ] Update checkout flow to choose the correct price per selected plan.
- [ ] Update webhook handling to map all supported Stripe price IDs.
- [ ] Ensure webhook idempotency continues to work for multi-plan updates.
- [ ] Handle upgrade, downgrade, cancel-at-period-end, trial, and reactivation transitions.
- [ ] Document billing setup and price rotation process.

## Phase 3: Backend enforcement and API consistency
- [ ] Audit all gated endpoints and map each to entitlement checks.
- [ ] Enforce all plan gates in backend handlers (UI gating remains secondary).
- [ ] Standardize error responses for plan restrictions (status, code, details, suggested upgrade target).
- [ ] Ensure backup/import/export routes use the new plan matrix.
- [ ] Ensure template cloning/saving from marketplace uses the new plan matrix.
- [ ] Add guardrails for over-limit behavior on writes and mutations.
- [ ] Add structured logs for blocked actions (with request correlation id).
- [ ] Update `GET /api/billing/status` output contract as needed (plan + limits + features).

## Phase 4: Frontend plan UX
- [ ] Update pricing page to show `Free`, `Basic`, `Pro` and accurate feature differences.
- [ ] Update account/billing UI to display current plan, billing state, and upgrade/downgrade actions.
- [ ] Update all gated UI actions to use consistent disabled states and upgrade CTAs.
- [ ] Add clear messaging when actions are blocked by plan limits.
- [ ] Ensure free/basic/pro gating is reflected in templates, runs, import/export, and marketplace flows.
- [ ] Verify route-level behavior for logged-out, free, basic, and pro users.
- [ ] Update any outdated `free/pro` copy in the UI.

## Phase 5: Admin and support workflows
- [ ] Update admin entitlement override endpoint to support `basic`.
- [ ] Add validation for override duration and optional reason/note.
- [ ] Add an audit trail for manual entitlement changes (who changed what and when).
- [ ] Document support runbook for granting/revoking plan overrides.

## Phase 6: Tests (required)
- [ ] Add unit tests for entitlement resolution across all plans and subscription states.
- [ ] Add unit tests for Stripe price mapping and fallback behavior.
- [ ] Add integration tests for each gated endpoint across `free/basic/pro`.
- [ ] Add integration tests for webhook event handling across plan transitions.
- [ ] Add e2e tests for upgrade and downgrade user journeys.
- [ ] Add regression tests for legacy `pro` users and migration scenarios.
- [ ] Add test fixtures for plan matrix coverage and edge cases.
- [ ] Ensure CI runs these tests and blocks merge on failures.

## Phase 7: Documentation and internal enablement
- [ ] Add/update canonical plans doc (`docs/product/plans.md`) with feature matrix.
- [ ] Update technical docs for entitlements enforcement and billing setup.
- [ ] Update operations docs with Stripe price rotation and incident handling.
- [ ] Add a support-facing quick reference for common customer billing issues.
- [ ] Add a changelog entry for plan architecture changes.
- [ ] Add post-implementation notes in `docs/knowledge/` for debugging and maintenance.

## Phase 8: Rollout and verification
- [ ] Add a phased rollout plan (dev -> staging -> production).
- [ ] Run end-to-end staging verification for all three plans.
- [ ] Verify real webhook delivery and entitlement updates in staging.
- [ ] Prepare and execute a production migration/checklist window.
- [ ] Monitor blocked-action metrics and billing conversion signals after launch.
- [ ] Validate no regressions in existing free/pro behavior after rollout.
- [ ] Mark rollout complete only after all verification steps pass.

## Completion criteria
- [ ] One canonical plan matrix exists and is current.
- [ ] One canonical machine-readable entitlement catalog is used by backend and frontend.
- [ ] Stripe price mapping is explicit and tested.
- [ ] API gates are fully enforced for all plan-restricted actions.
- [ ] UI behavior is consistent with backend entitlement rules.
- [ ] Test coverage includes unit, integration, and e2e for plan behavior.
- [ ] Operations and support docs are updated and actionable.
