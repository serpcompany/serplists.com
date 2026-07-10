# New UI Beta MVP Branch Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a beta-usable new UI for the core template and run flows while preserving the current backend contracts and route semantics.

**Architecture:** Keep `src/lib/api.ts` as the transport layer, move normalization and orchestration into feature-level services/hooks, and rebuild only the highest-value screens on top of those contracts. Do not attempt a full-site redesign before beta; the target is a stable, usable slice of the product.

**Tech Stack:** Vite, React 18, React Router 6, TanStack Query, Tailwind, shadcn/ui primitives, Vitest, Playwright.

---

## Current Branch Context

This plan is a continuation of the current branch, not a greenfield implementation plan.

The branch already contains:

- route and IA cleanup for canonical public/private paths
- shared layout and page-shell groundwork
- UI and decoupling audits
- MVP TODO inventory for known user-facing issues
- supporting docs/schema/template tooling work

The branch does not yet contain the core implementation phase of the UI replacement. This plan starts at that handoff point.

## Goal

Ship a beta-usable new UI for the core Serplists product flows without rewriting backend contracts.

The beta scope is intentionally narrow:

- public template discovery can remain mostly as-is
- the new UI must cover the highest-value product flows
- frontend/backend coupling must be reduced enough that the new screens are not blocked by raw API details

## Beta MVP Definition

The new UI beta MVP is complete when all of the following are true:

- `/profile/:username/:templateSlug` uses the new UI and preserves login, billing, copy, and run-start behavior
- `/dashboard/runs/:id` and `/share/:shareToken` use the new UI and preserves progress, sharing, and completion behavior
- `/dashboard/templates/new` and `/dashboard/templates/:id/edit` use the new UI and preserve create/edit/save behavior
- `/dashboard/templates` uses the new UI for owned-template management and launching runs
- logged-in navigation makes runs and templates first-class destinations
- the stale-run update bug is fixed
- the primary product screens no longer depend on direct page-level `api` imports
- `TemplatesContext` is no longer the mandatory god-object for the migrated flows
- `typecheck`, `build`, unit tests, and a targeted smoke pass are green

## Out of Scope

The following can wait until after beta:

- full marketing-page redesign
- category and profile-page visual parity beyond light cleanup
- total design-system parity for every route
- a full account-page redesign unless needed for active beta onboarding
- broad library/discovery experimentation

## Problem Statement

The current branch contains planning, audits, route cleanup, and some shared layout improvements, but the product still runs through the old screen orchestration model:

- `src/contexts/TemplatesContext.tsx` owns transport, mapping, mutations, cache invalidation, and user-facing toasts
- key pages still import `api` directly
- the high-risk screens (`PublicTemplate`, `ChecklistRun`, `TemplateEditor`, `Dashboard/Templates`) still mix feature logic with page composition
- the repo documents a future parity pass rather than a completed new UI migration

This means the branch has useful preparation work, but it is not yet in a state where a new UI can be shipped quickly and safely across the main product flows.

## Recommended Approach

Use a thin feature-service migration plus selective screen replacement.

This is the recommended approach because it avoids both extremes:

- it avoids a shallow theme pass that would leave the current architectural bottlenecks intact
- it avoids a full rewrite of the entire app surface before users can try the new UI

### Why this approach

- The route contracts are already documented and stable enough to preserve.
- The current branch groundwork is enough to support a focused implementation phase without restarting discovery.
- The highest-value screens are known.
- The service-boundary work can be targeted at template detail, run execution, editor save/load, and dashboard template management.
- The beta goal is product usability, not perfect parity on every page.

## Alternative Approaches Considered

### 1. Full app-wide UI replacement first

Pros:

- one large visual reset
- fewer temporary mixed-UI states

Cons:

- too much surface area before user feedback
- higher regression risk on lower-value pages
- delays beta access

Decision:

- rejected for beta MVP

### 2. Theme pass only

Pros:

- faster visual change
- lower immediate implementation cost

Cons:

- does not solve the screen/service coupling
- leaves key flows hard to maintain
- does not satisfy the original branch goal

Decision:

- rejected because it would produce the appearance of progress without delivering a durable UI boundary

### 3. Feature-service migration first, then highest-value screen replacement

Pros:

- fastest safe path to a real beta
- keeps route/product behavior stable
- creates a reusable contract for future screen work

Cons:

- some screens will remain on the old UI during the migration
- requires disciplined scope control

Decision:

- recommended

## Architecture

### How the existing branch work fits

The existing branch artifacts should be treated as inputs to implementation:

- route and IA cleanup reduce navigation churn while migrated screens are swapped in
- shared shell/page-surface work provides a visual baseline for mixed old/new route periods
- the UI feature audit defines the screen order and regression risk
- the decoupling audit defines the extraction targets and failure conditions
- the MVP TODOs define the trust-breaking product issues that must be resolved before beta

The implementation phase should follow directly from those artifacts rather than replacing them.

### Current-state constraint

The app is a Vite React SPA rooted in `src/App.tsx` with route shells already partially normalized.

The new UI beta MVP should keep:

- the existing route semantics
- the current auth model
- the current API contracts
- the current template/run/account business rules

It should change:

- page composition
- design vocabulary
- feature access boundaries between screens and transport

### Target architecture

For the migrated flows, the stack should be:

1. `src/lib/api.ts`
   canonical transport only
2. feature mappers/services
   normalize backend payloads into stable domain shapes and expose typed outcomes
3. headless hooks or feature models
   own async orchestration for a screen without owning toasts or navigation
4. screens
   compose UI, navigation, toasts, and dialogs
5. presentational components
   render-only where practical

### Immediate feature modules to introduce

- `src/features/template-detail/*`
- `src/features/run-execution/*`
- `src/features/template-editor/*`
- `src/features/dashboard-templates/*`

These do not need to be perfect long-term modules. They need to be stable enough that the beta UI screens consume them instead of raw page-local transport logic.

## Phase Map

### Phase 1: Completed groundwork on this branch

Already present before this plan executes:

- route/IA cleanup
- shell/layout normalization
- UI inventory and risk analysis
- decoupling audit and execution checklist
- MVP issue inventory

### Phase 2: Stabilize and reconcile current branch state

Tasks in this plan:

- green the baseline tests
- fix the stale-run trust bug
- align the branch narrative and active TODOs to the implementation phase

### Phase 3: Extract feature boundaries

Tasks in this plan:

- template detail model
- run execution model
- editor model
- dashboard templates model

### Phase 4: Migrate beta routes onto the new UI

Tasks in this plan:

- `PublicTemplate`
- `ChecklistRun`
- `TemplateEditor`
- `Templates` plus logged-in nav

### Phase 5: Beta QA and sign-off

Tasks in this plan:

- browser verification
- automated verification
- beta handoff notes

---

## File Map

### Existing files to modify

- `src/contexts/TemplatesContext.tsx`
- `src/pages/PublicTemplate.tsx`
- `src/pages/ChecklistRun.tsx`
- `src/pages/TemplateEditor.tsx`
- `src/pages/Templates.tsx`
- `src/components/Layout.tsx`
- `src/lib/access-flow.ts`
- `src/hooks/useTemplateSave.ts`
- `tests/unit/components/LayoutShell.test.tsx`
- `tests/unit/lib/auth/devUsers.test.ts`
- `src/lib/auth/devUsers.ts`
- `_todo/MVP.md`

### New files to create

- `src/features/template-detail/templateDetailMappers.ts`
- `src/features/template-detail/useTemplateDetailModel.ts`
- `src/features/run-execution/runExecutionMappers.ts`
- `src/features/run-execution/useRunExecutionModel.ts`
- `src/features/template-editor/useTemplateEditorModel.ts`
- `src/features/dashboard-templates/useDashboardTemplatesModel.ts`
- `tests/unit/features/template-detail/useTemplateDetailModel.test.ts`
- `tests/unit/features/run-execution/useRunExecutionModel.test.ts`
- `tests/unit/features/template-editor/useTemplateEditorModel.test.ts`
- `tests/unit/features/dashboard-templates/useDashboardTemplatesModel.test.ts`

### Verification commands used throughout

- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run test:run`
- `pnpm run test:smoke`

---

### Task 1: Reconcile the Current Branch Baseline

**Files:**
- Modify: `tests/unit/components/LayoutShell.test.tsx`
- Modify: `tests/unit/lib/auth/devUsers.test.ts`
- Modify: `src/lib/auth/devUsers.ts`
- Modify: `docs/superpowers/specs/2026-04-18-new-ui-beta-mvp-design.md`
- Modify: `docs/superpowers/plans/2026-04-18-new-ui-beta-mvp.md`
- Test: `pnpm run test:run`

- [ ] **Step 1: Reproduce the current failing tests**

Run:

```bash
pnpm run test:run
```

Expected:

- `LayoutShell.test.tsx` fails because the footer assertion expects outdated copy
- `devUsers.test.ts` fails because the seeded persona list no longer matches `src/lib/auth/devUsers.ts`

- [ ] **Step 2: Update the layout-shell expectation to the current intended footer contract**

Target the assertion block around:

```tsx
expect(html).toContain('Company');
expect(html).toContain('Support');
expect(html).toContain('Network');
expect(html).toContain('SERP DR');
```

Remove or replace the stale assertion:

```tsx
expect(html).toContain('Checklists');
```

with an assertion that matches the actual lean footer copy:

```tsx
expect(html).toContain('Build repeatable checklists, publish them cleanly, and run them like operations.');
```

- [ ] **Step 3: Decide whether `checklists@serp.co` is intentional and make code and test consistent**

If `checklists@serp.co` is intentionally part of the dev persona set, update the test:

```tsx
expect(DEV_TEST_USERS.map((user) => user.email)).toEqual([
  "checklists@serp.co",
  "admin@test.com",
  "john@test.com",
  "jane@test.com",
  "bob@test.com",
]);
```

If it is not intentional, remove it from:

```ts
export const DEV_TEST_USERS: DevTestUser[] = [
  { email: "checklists@serp.co", ... },
  ...
];
```

Recommendation:

- keep the code as source of truth and update the test

- [ ] **Step 4: Re-run the test suite**

Run:

```bash
pnpm run test:run
```

Expected:

- current red tests are gone
- no new failures introduced

- [ ] **Step 5: Record branch-state reconciliation in working notes**

Add a short note to `_todo/MVP.md` or the active working notes indicating:

- test suite green
- branch groundwork acknowledged as complete
- implementation phase now starts from this stabilized baseline

Do not commit unless explicitly instructed.

---

### Task 2: Fix the Stale-Run Update Contract

**Files:**
- Modify: `src/contexts/TemplatesContext.tsx`
- Modify: `src/pages/TemplateDetail.tsx` or the save path actually used
- Test: `tests/unit/features/template-editor/useTemplateEditorModel.test.ts` or a focused regression test near current save logic

- [ ] **Step 1: Write a focused failing regression test for template edits affecting existing runs**

Create a focused test describing the real bug from `_todo/MVP.md`:

```ts
it("updates existing runs when a template changes", async () => {
  // seed template + existing run from same template version path
  // perform template update
  // assert run data refreshes or the success message no longer claims it refreshed
});
```

The minimum acceptable outcome is one of:

- existing runs really refresh
- or the misleading toast is removed and replaced with truthful copy

Recommendation:

- prefer truthful behavior over a misleading success message

- [ ] **Step 2: Trace the current update path and choose the contract**

Inspect:

- `updateTemplateMutation` in `src/contexts/TemplatesContext.tsx`
- any run-refresh logic or missing invalidation

Current misleading copy appears here:

```ts
toast.success("Template updated successfully - all related runs have been updated");
```

Replace it with one of:

```ts
toast.success("Template updated successfully");
```

or implement actual run refresh behavior if the product truly requires live propagation.

- [ ] **Step 3: Implement the minimal fix**

Prefer the minimal truthful change first:

```ts
toast.success("Template updated successfully");
```

Then, only if product requirements demand it, add explicit run refresh behavior and tests.

- [ ] **Step 4: Re-run the targeted regression and the full unit suite**

Run:

```bash
pnpm run test:run
```

Expected:

- regression passes
- no stale-message assertion failures remain

---

### Task 3: Extract Template Detail Feature Contracts

**Files:**
- Create: `src/features/template-detail/templateDetailMappers.ts`
- Create: `src/features/template-detail/useTemplateDetailModel.ts`
- Modify: `src/pages/PublicTemplate.tsx`
- Modify: `src/pages/TemplateDetail.tsx`
- Test: `tests/unit/features/template-detail/useTemplateDetailModel.test.ts`

- [ ] **Step 1: Write failing model tests for template detail behavior**

Cover:

- loading a public template from cached data first
- falling back to API fetch
- owner resolution / not-found handling
- start-run action outcome
- save/copy gating outcome

Example skeleton:

```ts
it("returns login_required when a signed-out user starts a run", async () => {});
it("returns upgrade_required when a free user tries to save a gated template", async () => {});
it("normalizes template payloads into ChecklistTemplate", async () => {});
```

- [ ] **Step 2: Centralize template normalization in `templateDetailMappers.ts`**

Move payload shaping out of `PublicTemplate.tsx` into pure functions like:

```ts
export function mapApiTemplateToChecklistTemplate(
  foundTemplate: Record<string, unknown>,
  fallbackSlug: string,
): ChecklistTemplate { ... }
```

and:

```ts
export function resolveTemplateOwnerProfile(...) { ... }
```

- [ ] **Step 3: Implement `useTemplateDetailModel.ts` as the orchestration boundary**

Expose typed state and actions:

```ts
type TemplateDetailActionResult =
  | { kind: "ok"; runId?: string; templateId?: string }
  | { kind: "login_required" }
  | { kind: "upgrade_required" }
  | { kind: "error"; message: string };
```

and:

```ts
export function useTemplateDetailModel(...) {
  return {
    template,
    loading,
    notFound,
    billingState,
    startRun,
    saveTemplate,
  };
}
```

Do not toast or navigate inside the feature model.

- [ ] **Step 4: Refactor `PublicTemplate.tsx` to consume the model**

Page responsibilities after refactor:

- read route params
- call the model
- toast on `error`
- navigate on `login_required`, `upgrade_required`, or successful result

The page should stop importing `api` directly.

- [ ] **Step 5: Refactor `TemplateDetail.tsx` to align with the same contract**

The goal is shared behavior parity between public and private template detail flows. Reuse the same mapper and action outcome model where practical.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
pnpm run test:run
pnpm run typecheck
```

Expected:

- new model tests pass
- `PublicTemplate.tsx` no longer imports `api`
- the first beta-route migration boundary is established cleanly on top of the branch audits

---

### Task 4: Extract Run Execution Feature Contracts

**Files:**
- Create: `src/features/run-execution/runExecutionMappers.ts`
- Create: `src/features/run-execution/useRunExecutionModel.ts`
- Modify: `src/pages/ChecklistRun.tsx`
- Test: `tests/unit/features/run-execution/useRunExecutionModel.test.ts`

- [ ] **Step 1: Write failing tests for run execution behavior**

Cover:

- loading private runs from cache first
- loading shared runs by share token
- selecting the first incomplete item
- toggling an item updates sub-items
- toggling sub-items updates parent completion
- completing the final item opens the completion path
- share-link creation is blocked on shared mode

- [ ] **Step 2: Move checklist/run normalization into `runExecutionMappers.ts`**

Extract code similar to:

```ts
export function mapChecklistToRun(
  checklist: Record<string, unknown>,
  fallbackId: string,
): ChecklistRun { ... }
```

from `src/pages/ChecklistRun.tsx`.

- [ ] **Step 3: Implement `useRunExecutionModel.ts`**

Expose:

```ts
export function useRunExecutionModel({
  runId,
  shareToken,
}: {
  runId?: string;
  shareToken?: string;
}) {
  return {
    run,
    loading,
    selectedItemId,
    setSelectedItemId,
    toggleItem,
    toggleSubItem,
    saveTitle,
    createShare,
    completeRun,
  };
}
```

Return typed action results instead of toasting or navigating inside the model.

- [ ] **Step 4: Refactor `ChecklistRun.tsx` into a composition-only screen**

After refactor, the page should:

- own dialogs and visual state
- own toast display and navigation
- consume the run execution model for all business actions

It should no longer import `api` directly.

- [ ] **Step 5: Layer the new run UI onto the extracted model instead of restyling in place**

Use the existing branch shell/layout work where helpful, but treat the extracted model as the hard boundary.

This avoids the messy half-state where the route looks new but still depends on old page-local orchestration.

- [ ] **Step 6: Verify private and shared flows**

Run:

```bash
pnpm run test:run
pnpm run typecheck
pnpm run build
```

Expected:

- run execution tests pass
- build remains green

---

### Task 5: Extract Editor Save/Load Feature Contracts

**Files:**
- Create: `src/features/template-editor/useTemplateEditorModel.ts`
- Modify: `src/pages/TemplateEditor.tsx`
- Modify: `src/hooks/useTemplateSave.ts`
- Modify: `src/lib/access-flow.ts`
- Test: `tests/unit/features/template-editor/useTemplateEditorModel.test.ts`

- [ ] **Step 1: Write failing tests around editor load/save outcomes**

Cover:

- load existing template from cache first
- fall back to API load
- create new template
- update existing template
- save returns typed success or error outcomes

- [ ] **Step 2: Introduce a model that owns editor data loading and save orchestration**

Implement:

```ts
export function useTemplateEditorModel({ id }: { id?: string }) {
  return {
    initialValues,
    loading,
    loadError,
    save,
    isSaving,
  };
}
```

The model may still call lower-level services, but the screen should stop calling `api.getTemplateById(...)` directly.

- [ ] **Step 3: Keep `useTemplateSave.ts` pure on outcomes**

This helper already trends in the right direction. Keep it focused on:

- validating inputs
- calling create/update dependencies
- returning `{ success, errors }`

Do not add new navigation, toast, or transport coupling here.

- [ ] **Step 4: Move redirect and toast decisions up into `TemplateEditor.tsx`**

The page should:

- render the new editor shell
- trigger save through the model
- decide how success and error messages are shown

The page should stop importing `api` directly.

- [ ] **Step 5: Layer the beta editor UI onto the extracted model**

Treat the current editor shell and section tooling as implementation inputs, not as permanent architecture.

The result should read as a continuation of the branch’s UI groundwork while using the new model as the actual source of behavior.

- [ ] **Step 6: Run verification**

Run:

```bash
pnpm run test:run
pnpm run typecheck
```

Expected:

- editor model tests pass
- `TemplateEditor.tsx` no longer imports `api`

---

### Task 6: Rebuild Dashboard Templates and Logged-In Navigation

**Files:**
- Create: `src/features/dashboard-templates/useDashboardTemplatesModel.ts`
- Modify: `src/pages/Templates.tsx`
- Modify: `src/components/Layout.tsx`
- Test: `tests/unit/features/dashboard-templates/useDashboardTemplatesModel.test.ts`

- [ ] **Step 1: Write failing tests for dashboard template management**

Cover:

- loading owned templates
- empty state behavior
- start-run launcher behavior
- create-template CTA presence
- new-run CTA presence

- [ ] **Step 2: Implement `useDashboardTemplatesModel.ts`**

Expose data and actions for:

```ts
{
  templates,
  loading,
  createRunFromTemplate,
  openTemplate,
  openCreateTemplate,
  openPublicLibrary,
}
```

Use feature-level contracts instead of page-local orchestration.

- [ ] **Step 3: Refactor `Templates.tsx` to the new model and new UI shell**

The new beta surface must:

- present owned templates clearly
- expose `+ New template`
- expose `+ New run`
- reduce the current navigation friction called out in `_todo/MVP.md`

- [ ] **Step 4: Update logged-in navigation in `Layout.tsx`**

For authenticated users, make `Templates` and `Runs` first-class destinations in the main shell.

At minimum:

- add direct access to `/dashboard/templates`
- add direct access to `/dashboard/runs`

Do not bury both under the profile menu alone.

- [ ] **Step 5: Make the shell changes read as a branch continuation**

The navigation and screen shell should visibly connect to the earlier route/IA cleanup already completed on this branch.

That means:

- preserve the canonical routes introduced earlier
- do not reintroduce old aliases as primary destinations
- keep the shell logic coherent across mixed old/new pages during migration

- [ ] **Step 6: Verify route behavior and shell tests**

Run:

```bash
pnpm run test:run
pnpm run build
```

Expected:

- layout and dashboard tests remain green
- authenticated navigation exposes the key destinations directly

---

### Task 7: Browser QA and Beta Sign-Off

**Files:**
- Modify: `_todo/MVP.md`
- Reference: `docs/qa/mvp-launch-signoff.md`

- [ ] **Step 1: Start the app locally and verify the migrated routes in a browser**

Run one of:

```bash
pnpm run dev:auto
```

or:

```bash
pnpm preview --host 127.0.0.1 --port 4173
```

Expected:

- app boots successfully
- no blocking runtime errors on the migrated routes

- [ ] **Step 2: Manually verify the core beta flows**

Check:

- `/templates`
- `/profile/:username/:templateSlug`
- `/dashboard/templates`
- `/dashboard/templates/new`
- `/dashboard/templates/:id/edit`
- `/dashboard/runs/:id`
- `/share/:shareToken`

Record pass/fail for:

- browse template
- save/copy template
- start run
- update run progress
- share run
- create template
- edit template

- [ ] **Step 3: Run the full verification set**

Run:

```bash
pnpm run typecheck
pnpm run build
pnpm run test:run
pnpm run test:smoke
```

Expected:

- all commands pass

- [ ] **Step 4: Update `_todo/MVP.md` with completion status**

Add or update entries for:

- stale-run bug resolved
- logged-in navigation resolved
- beta UI routes migrated
- verification completed

- [ ] **Step 5: Prepare beta handoff notes**

Document:

- which routes are on the new UI
- which routes remain on the old UI
- known deferred items
- recommended beta test focus areas

Do not commit unless explicitly instructed.

---

## Mesh Rules

These are the rules that keep the existing branch work and the implementation phase from fighting each other:

- treat branch audits as implementation inputs, not dead docs
- do not perform broad restyling before the matching feature boundary exists
- migrate one feature boundary and one screen cluster together
- preserve canonical routes and existing product behavior while the UI is swapped
- prefer truthful product behavior over optimistic or misleading UI copy
- accept temporary mixed old/new visuals outside the beta routes until the beta slice is stable

---

## Self-Review

### Spec coverage

Covered:

- current branch groundwork acknowledged explicitly
- baseline stabilization
- stale-run trust bug
- service-boundary extraction
- new UI on the key beta routes
- logged-in navigation
- verification and beta sign-off

Deferred by design:

- full-site redesign
- low-priority route parity
- broad account-page redesign

### Placeholder scan

No `TBD` or `TODO` placeholders remain in the plan steps. Each task names exact files and commands.

### Type consistency

The plan consistently uses feature-model hooks returning typed outcomes rather than page-level transport or side effects. The same outcome pattern is reused across template detail, run execution, and editor flows.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-18-new-ui-beta-mvp.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
