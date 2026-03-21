# Free/Pro Launch TODO

This checklist tracks only the work needed to launch the current paid plan scope.

Launch scope:

- `Free`
- `Pro`

Canonical plan matrix: `docs/product/plans.md`

Deferred work:

- `basic` tier and broader multi-tier billing architecture are post-launch items tracked separately.
- See issue `#26` for the launch-scope cleanup decision.

## Phase 0: Plan definition
- [x] Add the canonical launch plans doc in `docs/product/plans.md`.
- [x] Define launch plans as `free` and `pro`.
- [x] Keep the launch paid split intentionally small.
- [x] Set the first paid upgrade reason to `Copy templates into your account`.
- [ ] Confirm the exact upgrade CTA copy for blocked copy/save actions.

## Phase 1: Stripe and billing
- [ ] Confirm the single active Stripe product and price for `Pro`.
- [ ] Verify checkout starts the correct `Pro` price.
- [ ] Verify webhook updates entitlements correctly after purchase.
- [ ] Verify customer portal access works for `Pro` users.
- [ ] Document active price IDs and billing env vars for launch.

## Phase 2: Backend enforcement
- [ ] Enforce the `Pro` gate for `Copy templates into your account`.
- [ ] Ensure the API returns one consistent paid-gate error contract.
- [ ] Verify free users cannot bypass the gate through direct API calls.
- [ ] Add structured logging for blocked paid actions if needed for launch support.

## Phase 3: Frontend plan UX
- [ ] Show a clear upgrade path when free users hit the copy/save gate.
- [ ] Ensure pricing and account surfaces reflect `Free` vs `Pro`.
- [ ] Remove outdated UI copy that implies broader launch plan tiers.
- [ ] Verify logged-out, free, and pro flows behave consistently around gated actions.

## Phase 4: Tests and verification
- [ ] Add automated coverage for the `Copy templates into your account` gate.
- [ ] Run end-to-end verification for a free user hitting the gate.
- [ ] Run end-to-end verification for a pro user completing the gated action.
- [ ] Verify billing-to-entitlement transition with a real or staging webhook flow.

## Phase 5: Launch docs and operations
- [x] Add/update the canonical plans doc with the launch feature matrix.
- [ ] Update technical docs for launch entitlement enforcement.
- [ ] Update billing setup docs with launch-safe instructions.
- [ ] Prepare a short launch-day verification and rollback checklist.
- [ ] Add post-implementation notes in `docs/knowledge/` after launch verification.

## Completion criteria
- [x] One canonical plan matrix exists and is current.
- [ ] Stripe is wired for a single `Pro` plan and verified.
- [ ] API gates are enforced for the launch paid feature.
- [ ] UI behavior matches backend entitlement rules.
- [ ] End-to-end verification covers both free and pro outcomes.
- [ ] Launch docs and operational notes are current enough to support release.
