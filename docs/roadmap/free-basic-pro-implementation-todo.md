# Free/Pro Launch TODO

This checklist tracks only the work needed to launch the current paid plan scope.

Launch scope:

- `Free`
- `Pro`

Canonical plan matrix: `docs/product/plans.md`

Deferred work:

- `basic` tier and broader multi-tier billing architecture are post-launch items tracked separately.
- See issue `#26` for the launch-scope cleanup decision.

Owner acceptance note:

- On March 21, 2026, the remaining launch checklist items below were accepted for MVP tracking without a fresh formal rerun of every sign-off step.
- Keep `docs/qa/mvp-launch-signoff.md` as the reference checklist if we want to run the full pass later.

## Phase 0: Plan definition
- [x] Add the canonical launch plans doc in `docs/product/plans.md`.
- [x] Define launch plans as `free` and `pro`.
- [x] Keep the launch paid split intentionally small.
- [x] Set the first paid upgrade reason to `Copy templates into your account`.
- [x] Confirm the exact upgrade CTA copy for blocked copy/save actions.

## Phase 1: Stripe and billing
- [x] Confirm the single active Stripe product and price for `Pro`.
- [x] Verify checkout starts the correct `Pro` price.
- [x] Verify webhook updates entitlements correctly after purchase.
- [x] Verify customer portal access works for `Pro` users.
- [x] Document active price IDs and billing env vars for launch.

## Phase 2: Backend enforcement
- [x] Enforce the `Pro` gate for `Copy templates into your account`.
- [x] Ensure the API returns one consistent paid-gate error contract.
- [x] Verify free users cannot bypass the gate through direct API calls.
- [x] Add structured logging for blocked paid actions if needed for launch support.

## Phase 3: Frontend plan UX
- [x] Show a clear upgrade path when free users hit the copy/save gate.
- [x] Ensure pricing and account surfaces reflect `Free` vs `Pro`.
- [x] Remove outdated UI copy that implies broader launch plan tiers.
- [x] Verify logged-out, free, and pro flows behave consistently around gated actions.

## Phase 4: Tests and verification
- [x] Add automated coverage for the `Copy templates into your account` gate.
- [x] Run end-to-end verification for a free user hitting the gate.
- [x] Run end-to-end verification for a pro user completing the gated action.
- [x] Verify billing-to-entitlement transition with a real or staging webhook flow.

## Phase 5: Launch docs and operations
- [x] Add/update the canonical plans doc with the launch feature matrix.
- [x] Update technical docs for launch entitlement enforcement.
- [x] Update billing setup docs with launch-safe instructions.
- [x] Add a production D1 schema-drift check to the release flow.
- [x] Prepare a short launch-day verification and rollback checklist in `docs/qa/mvp-launch-signoff.md`.
- [x] Add post-implementation notes in `docs/knowledge/` after launch verification.

## Completion criteria
- [x] One canonical plan matrix exists and is current.
- [x] Stripe is wired for a single `Pro` plan and verified.
- [x] API gates are enforced for the launch paid feature.
- [x] UI behavior matches backend entitlement rules.
- [x] End-to-end verification covers both free and pro outcomes.
- [x] Launch docs and operational notes are current enough to support release.
