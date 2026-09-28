# UI Decoupling Execution Plan

- **Status:** active
- **Last updated:** 2026-09-28
- **Goal:** product screens consume typed feature state and actions, never transport
  code, so a new UI can be built without re-implementing business rules.

## Progress

Mechanical tracking: the `screens-do-not-call-transport` rule in `pnpm run deps:check`
fails on any new direct `api` call from `src/pages` or `src/components`. Remaining
legacy call sites are listed in `.dependency-cruiser-known-violations.json`.

- [x] Task 1: legacy `api/client.ts` removed (2026-09-27). It was imported only by
  its own test, so the 401-redirect behavior added to it never reached the app;
  see the [tech debt tracker](../tech-debt-tracker.md).
- [x] Task 5: `PublicTemplate`, `TemplateDetail`, and `ChecklistRun` no longer call
  `api` at runtime (type-only imports remain). Verified by `deps:check`.
- [ ] Remove the remaining direct `api` calls from 8 components and pages (see the
  known-violations file). `UserInfo.tsx` was dead code and was deleted on 2026-09-27.
  `TemplateBackup.tsx` stopped calling `api` on 2026-09-28 (billing status through
  `useBillingStatus`, export through `features/template-backup/exportTemplatePack.ts`).
- [ ] Tasks 2, 3, 4, 6, 7: status not re-verified since 2026-04-10. Check the code
  before starting; mapper modules already exist under `src/features/*`.

## Decision log

- 2026-09-27: Replaced checklist-only tracking of the "no direct `api` in screens"
  rule with a dependency-cruiser rule plus known-violations baseline, so progress
  is measured by the build instead of by this document.

## Original plan (2026-04-10)

This section turns the architecture audit into an execution sequence.

It answers two practical questions:

- What should we start now before the new frontend comes back?
- How should we use subagent-driven development to move faster without lowering quality?

Related audit:

- [ui-service-decoupling-audit.md](../../design-docs/ui-service-decoupling-audit.md)

## Start Now vs Wait

## Start now

These items are safe to do before the frontend redesign comes back because they improve architecture regardless of the final visual direction.

### 1. Consolidate the service boundary for templates and runs

Why now:

- The current bottleneck is structural, not visual.
- Any new UI will benefit from thinner screens and feature-oriented services.

Do now:

- extract template and run orchestration out of `src/contexts/TemplatesContext.tsx`
- keep `src/lib/api.ts` as the canonical transport boundary
- stop adding new feature behavior to `TemplatesContext`

Expected result:

- a thinner application surface that any new UI can consume

### 2. Centralize normalization and mapping

Why now:

- This is a prerequisite for UI independence.
- The backend shape should stop leaking into pages before redesign work starts.

Do now:

- create shared mappers for:
  - API template -> `ChecklistTemplate`
  - API checklist/run -> `ChecklistRun`
  - legacy flat items -> section-based shape
  - profile augmentation for public templates

Expected result:

- new UI will not need to know transport quirks

### 3. Move side effects upward

Why now:

- Toasts and navigation should not be part of reusable feature logic.

Do now:

- make services and headless hooks return typed outcomes
- move `toast`, redirect, and billing-navigation decisions to screen composition

Expected result:

- feature logic becomes UI-agnostic

### 4. Remove direct `api` imports from product screens

Why now:

- This is the clearest concrete signal of UI/backend coupling.

Do now:

- stop routing pages through `api` directly
- route them through feature hooks/services instead

High-value first targets:

- `src/pages/PublicTemplate.tsx`
- `src/pages/ChecklistRun.tsx`
- `src/pages/TemplateDetail.tsx`
- `src/pages/TemplateEditor.tsx`
- `src/pages/UserProfile.tsx`

Expected result:

- page code becomes composition-only

### 5. Resolve the duplicate client story

Why now:

- A new UI should not inherit two competing service access paths.

Do now:

- classify the legacy `api/client.ts` (done 2026-09-27: removed)
- remove it if obsolete, or quarantine/document it clearly if still needed

Expected result:

- one service transport story across the frontend

## Wait until frontend comes back

These items depend more heavily on the new UI direction and should not be overcommitted early.

### 6. Final shape of headless hooks by screen

Wait because:

- the redesign may change how many screens exist and how responsibilities split

Examples:

- exact `useTemplateDetailModel`
- exact `useRunExecutionModel`
- exact editor composition model

### 7. Final feature-module boundaries for public vs private detail flows

Wait because:

- the new frontend may merge or further separate evaluation, editing, and execution surfaces

### 8. Component decomposition tied to layout or interaction design

Wait because:

- once the new frontend comes back, the component inventory will be clearer

Examples:

- editor panels
- run detail composition
- action bars
- mobile/desktop interaction variants

### 9. Large cleanup of shadcn-facing presentational components

Wait because:

- once the new UI direction is known, it is better to replace component shells with intent

## Suggested execution order

### Phase 1: foundation hardening

Goal:

- remove the biggest architectural blockers without changing the product surface

Tasks:

- classify and thin `TemplatesContext`
- centralize normalization
- resolve duplicate API client
- define typed service outcomes

### Phase 2: screen decoupling

Goal:

- make product pages depend on feature hooks/services instead of transport and ad hoc orchestration

Tasks:

- migrate public template detail
- migrate private template detail
- migrate run execution
- migrate template editor load/save path

### Phase 3: redesign-ready feature contracts

Goal:

- lock the reusable interface the new frontend will consume

Tasks:

- formalize headless feature models
- document state/action contracts
- keep presentational UI thin

### Phase 4: new UI integration

Goal:

- build the new frontend against already-decoupled feature modules

Tasks:

- replace current screen compositions
- replace or reduce shadcn dependence
- reuse domain logic and application services

## Subagent-Driven Development Plan

This section defines how to execute the decoupling work using the `subagent-driven-development` workflow.

Core rule:

- one fresh implementer subagent per task
- spec review after implementation
- code-quality review after spec approval
- no task is complete until both reviews pass

## When to use subagents here

Use subagent-driven development for tasks that are:

- well-scoped
- independently testable
- not deeply blocked on simultaneous edits to the same files

Do not run multiple implementer subagents in parallel on overlapping files.

## Controller workflow for this project

For each task:

1. Define the exact goal and touched files.
2. Provide the subagent only the necessary context.
3. Have the implementer subagent make the change, run tests, and self-review.
4. Dispatch a spec reviewer to confirm the task matches the intended refactor.
5. Dispatch a code-quality reviewer to catch architecture drift, weak boundaries, or cleanup issues.
6. Only then mark the task complete.

## Dev-QA cycle standard

Every task should follow this loop:

1. `Implement`
   The implementer changes code and runs the narrowest relevant verification.
2. `Spec review`
   Confirm the task solved the intended coupling problem and did not overbuild.
3. `Quality review`
   Confirm the result improved boundaries and did not introduce new hidden coupling.
4. `Fix loop`
   If either review finds issues, send the same implementer back with only the relevant review findings.

## Task sizing rules

Preferred task size:

- 1 to 3 files for mechanical cleanup
- up to 5 files if the integration boundary is obvious

If a task needs more than that, split it.

## Recommended task queue

These are the first tasks to execute with subagents.

### Task 1: classify and resolve the legacy `api/client.ts` (done)

Goal:

- determine whether it is dead code and remove or quarantine it

Why first:

- removes ambiguity from the service story

Suggested model:

- small/cheap implementation model

Review focus:

- no remaining active imports
- no accidental auth regression

### Task 2: extract template response mapping into reusable mappers

Goal:

- stop page-level template normalization duplication

Suggested targets:

- public template detail
- private template detail
- library/profile mapping paths

Suggested model:

- standard model

Review focus:

- one mapping path
- no page-level backend-shape handling left behind

### Task 3: extract run response mapping and progress helpers into reusable run module

Goal:

- stop route-level run shape and progress orchestration duplication

Suggested model:

- standard model

Review focus:

- shared/private run paths both use the same domain helpers

### Task 4: thin `TemplatesContext` by moving transport and mapping into feature services

Goal:

- make the context a consumer of services rather than the source of all logic

Suggested model:

- strong standard model or higher

Review focus:

- reduced responsibilities
- no lost feature behavior
- no hidden toast/navigation coupling introduced

### Task 5: remove direct `api` usage from `PublicTemplate`, `TemplateDetail`, and `ChecklistRun`

Goal:

- move those pages onto feature hooks/services

Suggested model:

- standard model

Review focus:

- page files become orchestration/presentation only

### Task 6: move toast and navigation side effects out of reusable services/helpers

Goal:

- make service actions return typed outcomes

Suggested model:

- strong standard model or higher

Review focus:

- no reusable module hardcodes user-facing side effects

### Task 7: split `TemplateBackup` into headless portability logic plus presentational UI

Goal:

- decouple the most entangled feature module

Suggested model:

- strong standard model or higher

Review focus:

- import/export logic reusable without the existing component shell

## Review criteria for subagent tasks

### Spec compliance review

The reviewer should check:

- Did the task address the intended coupling point?
- Were boundaries improved in the specific way requested?
- Was any unrelated architectural reshaping introduced?
- Were all required files updated?

### Code quality review

The reviewer should check:

- Is the result easier to reuse from a different UI?
- Did transport, mapping, and side effects move in the right direction?
- Did the task reduce or accidentally increase coupling?
- Are names and module boundaries clear enough for future redesign work?

## Task completion definition

A task is complete only when:

- implementation is done
- narrow tests/checks pass
- spec review passes
- code quality review passes

## Suggested branch and cycle strategy

Use one short-lived branch for the decoupling effort, but treat each refactor task as a small independently reviewable unit.

Good cycle:

- pick one task
- implement and review it completely
- merge mentally into the working branch
- move to the next task

Bad cycle:

- start several partially overlapping refactors at once
- let multiple agents touch the same architecture hotspot in parallel

## Exit conditions before involving the redesign implementation

Before the new frontend starts building against the decoupled system, try to reach this minimum state:

- duplicate API client resolved
- shared mapping layer exists
- `TemplatesContext` responsibilities reduced
- key product pages no longer import `api` directly
- portability logic no longer lives entirely inside one UI component
- reusable service outcomes exist for auth/upgrade/billing-related template actions

## Immediate recommendation

Start now with:

1. `api/client.ts` resolution
2. template/run mapper extraction
3. `TemplatesContext` thinning
4. direct `api` removal from the main checklist/template pages

Wait on the more UX-shaped hook and component boundaries until the new frontend direction is back.
