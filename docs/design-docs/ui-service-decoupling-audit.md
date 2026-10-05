# UI-Service Decoupling Audit

> Point-in-time audit from 2026-04. Current status lives in the [UI decoupling execution plan](../exec-plans/active/ui-decoupling.md).

## Goal and Readiness Criteria

This audit answers a specific question:

Can the checklist/template product be rebuilt with a brand new UI and a different component stack without re-implementing core business rules?

The target is not “rewrite everything.” The target is a frontend architecture where:

- domain rules live outside screens and design-system components
- screens consume typed state and actions instead of raw endpoint details
- UI components are mostly data-in / events-out
- navigation, toast, and billing redirects happen at the composition layer instead of inside core feature logic
- a new design system can replace shadcn without forcing a rewrite of template/run behavior

### Ready enough for a new UI means

- checklist/template screens do not import transport code directly
- template and run rules are available through reusable feature services and headless hooks
- normalization between backend payloads and frontend domain objects is centralized
- design-system components do not own cross-screen business logic
- a new UI can be built against typed contracts and mocked data

### Not ready means

- pages still call `api` directly
- feature contexts or hooks combine transport, mapping, mutation, cache invalidation, navigation, and toast behavior
- business rules are duplicated across screens
- the only way to rebuild a flow is to re-read page code and backend payload handling

## Current Architecture Map

## Layer 1: API adapter layer

### Canonical transport client

- `src/lib/api.ts`

What it does today:

- wraps `fetch`
- sets credentials
- throws normalized API errors
- exposes template, checklist, profile, upload, and billing endpoints

Assessment:

- This is a useful seam and should remain the canonical transport layer.
- It is transport-oriented, not feature-oriented.

### Divergent legacy client

- the legacy `api/client.ts` (removed 2026-09-27)

What it does today:

- uses localStorage token auth
- has a different auth model than the Better Auth cookie-based app
- includes overlapping template/checklist methods

Assessment:

- This creates ambiguity in the service story.
- It should be classified and resolved as either dead code, migration residue, or a supported alternate path.

## Layer 2: Domain types and pure helpers

### Strong reusable pieces already present

- `src/types/checklist.ts`
- `src/lib/schemas/checklistSchema.ts`
- `src/lib/utils/checklistSections.ts`
- `src/lib/forms/templateEditorForm.ts`
- `src/lib/forms/templateEditorDetailsForm.ts`

What they do well:

- define stable checklist/template/run shapes
- define portable template schemas
- normalize sections and progress logic
- isolate some form-level structure

Assessment:

- This is the healthiest part of the current architecture.
- These files already form the beginning of a reusable domain layer.

## Layer 3: Application and feature orchestration

### Current central orchestrator

- `src/contexts/TemplatesContext.tsx`

What it does today:

- fetches templates and runs
- maps raw API payloads to app shapes
- merges repo-backed templates with API templates
- creates, updates, deletes templates and runs
- calculates progress
- enforces import constraints
- invalidates React Query caches
- emits toast messages

Assessment:

- This is the main architecture bottleneck.
- It is simultaneously acting as feature repository, adapter, use-case layer, mutation coordinator, and UX side-effect layer.

### Other application-adjacent helpers

- `src/lib/access-flow.ts`
- `src/hooks/useTemplateSave.ts`
- `useTemplateActions.ts` (removed 2026-09-27)

Assessment:

- These are trying to express feature actions, but they still mix domain behavior with navigation, checkout redirects, and toast messaging.

## Layer 4: Screen/container components

Key checklist/template screens:

- `src/views/Templates.tsx`
- `src/views/TemplateDetail.tsx`
- `src/views/PublicTemplate.tsx`
- `src/views/TemplateEditor.tsx`
- `src/views/ChecklistRun.tsx`
- `src/views/Dashboard.tsx`
- `src/views/ChecklistLibrary.tsx`
- `src/views/PublicProfile.tsx`

Assessment:

- Several pages do too much orchestration themselves.
- Some pages use `useTemplates()`, some call `api` directly, and some do both.
- This creates inconsistent boundaries across flows.

## Layer 5: Presentational components and design-system components

Examples:

- `src/components/template/PublicTemplateView.tsx`
- `ChecklistContent.tsx` (removed 2026-09-27)
- `src/components/template-editor/*`
- `src/components/checklist-library/*`
- `src/components/ui/*`

Assessment:

- Many of these are reasonably UI-focused.
- Some shared components still own service access or file-upload behavior, which weakens replaceability.

## Coupling Findings

## High-severity findings

### 1. `TemplatesContext` is a god-object

Primary file:

- `src/contexts/TemplatesContext.tsx`

Why this matters:

- The context is the de facto application layer for templates and runs.
- A new UI cannot cleanly consume feature behavior without inheriting this oversized abstraction.

Evidence:

- fetches templates and runs
- transforms raw API responses
- merges sources (`repoTemplates` plus API)
- owns mutations for create/update/delete
- owns progress computation and reset behavior
- owns import constraints such as template and asset limits
- owns cache invalidation
- owns user-facing toast messages

Impact:

- Feature logic is hard to reuse outside the current React/provider shape.
- Replacing screens or state composition requires touching the same central file.

### 2. Direct API imports still exist in pages and shared components

Examples:

- `src/views/PublicTemplate.tsx`
- `src/views/ChecklistRun.tsx`
- `src/views/TemplateDetail.tsx`
- `src/views/TemplateEditor.tsx`
- `src/views/PublicProfile.tsx`
- `src/components/TemplateBackup.tsx`
- `src/components/shared/AvatarUpload.tsx`
- `UserInfo.tsx` (removed 2026-09-27)

Why this matters:

- UI layers should not need to know transport details to render a feature.
- A new UI would have to rediscover endpoint behavior by reading page code.

Impact:

- No consistent feature boundary
- inconsistent state ownership
- harder mocking and testing

### 3. UX side effects are embedded inside service-like layers

Examples:

- `src/contexts/TemplatesContext.tsx`
- `src/lib/access-flow.ts`
- `useTemplateActions.ts` (removed 2026-09-27)

Why this matters:

- Domain or application actions should return outcomes.
- Screens should decide how to toast, redirect, or otherwise present those outcomes.

Current coupling:

- `toast.success` and `toast.error` happen inside mutations and access helpers
- billing checkout performs immediate browser redirect from helper code
- auth-required handling may navigate from access helpers

Impact:

- difficult to reuse actions in another UI shell
- difficult to test outcomes without browser and toast behavior

### 4. Transport-shape normalization is duplicated across the UI

Examples:

- `src/contexts/TemplatesContext.tsx`
- `src/views/PublicTemplate.tsx`
- `src/views/TemplateDetail.tsx`
- `src/views/ChecklistRun.tsx`
- `src/views/PublicProfile.tsx`

Why this matters:

- Backend payload quirks should be absorbed in one place.
- Pages should not need to decide whether `items` is legacy flat data or already sectioned data.

Impact:

- duplication
- risk of drift between screens
- extra effort for any new UI implementation

### 5. Shared components sometimes own data fetching and mutations

Examples:

- `UserInfo.tsx` (removed 2026-09-27)
- `src/components/shared/AvatarUpload.tsx`
- `src/components/TemplateBackup.tsx`

Why this matters:

- These are not purely presentational components.
- Their logic is bound to current transport and auth choices.

Impact:

- harder to reuse these modules in a different UI architecture
- design-system replacement does not actually free the feature logic

## Medium-severity findings

### 6. Feature boundaries are inconsistent

Examples:

- `useTemplateLibrary` is mostly headless and UI-friendly
- `useTemplateSave` still depends on `useTemplates` and navigation side effects
- `useTemplateActions` mixes navigation and run creation

Why this matters:

- There is no single pattern for feature modules.
- Some flows are closer to reusable than others, which increases cognitive load and refactor risk.

### 7. Access/entitlement logic is useful but still composition-coupled

Primary file:

- `src/lib/access-flow.ts`

What is good:

- centralizes auth-required and upgrade-required handling

What is not yet ideal:

- still imports `api`
- still performs toasts and redirect side effects directly

Impact:

- useful helper, but not yet a UI-agnostic application service

### 8. React Query is present, but feature ownership is blurred

Primary file:

- `src/contexts/TemplatesContext.tsx`

Why this matters:

- React Query is a good foundation for a modular frontend
- but currently one provider owns most query and mutation composition

Impact:

- good infrastructure, weak feature slicing

## Low-severity findings

### 9. Presentational checklist/template components are mostly reusable

Examples:

- `src/components/template/PublicTemplateView.tsx`
- `ChecklistContent.tsx` (removed 2026-09-27)
- `src/components/checklist-library/SearchAndFilters.tsx`

Why this is good:

- these already lean toward prop-driven rendering
- they are better positioned for a UI rewrite than the orchestration layer

### 10. Domain helpers already support modularization

Examples:

- `src/lib/utils/checklistSections.ts`
- `src/lib/forms/templateEditorForm.ts`
- `src/lib/schemas/checklistSchema.ts`

Why this is good:

- progress rules, reset behavior, and schema validation already have a reusable home

## Readiness Scorecard by Workflow

Legend:

- `Green`: mostly UI-replaceable already
- `Yellow`: partly reusable, but notable boundary work remains
- `Red`: strongly coupled to current screen/context setup

| Workflow | UI replaceability | Business-rule isolation | API independence | Design-system independence | Overall |
| --- | --- | --- | --- | --- | --- |
| Public template library | Yellow | Yellow | Yellow | Green | Yellow |
| Public template detail | Yellow | Yellow | Red | Yellow | Yellow |
| Private template library | Yellow | Yellow | Yellow | Yellow | Yellow |
| Private template detail | Yellow | Yellow | Red | Yellow | Yellow |
| Template editor | Yellow | Yellow | Red | Yellow | Yellow |
| Private run execution | Yellow | Yellow | Red | Yellow | Yellow |
| Shared run execution | Yellow | Yellow | Red | Yellow | Yellow |
| Import/export | Red | Red | Red | Yellow | Red |
| Auth/upgrade gating in template flows | Yellow | Yellow | Yellow | Green | Yellow |

### Scorecard notes

#### Public template library

- The UI itself is fairly separable.
- The weakness is that library data still ultimately comes through a broad context instead of a dedicated feature service.

#### Public template detail

- The rendering surface is reasonably prop-driven.
- The page still does transport work, normalization, billing checks, and action orchestration itself.

#### Private template library

- The list surface is reusable.
- The import/export module and run-launch flows weaken modularity.

#### Private template detail

- Similar to public detail.
- Action orchestration and copy/share behavior are not yet behind a dedicated feature module.

#### Template editor

- The editor panels are structurally reusable.
- The route still owns loading and direct API access for edit mode, and feature save logic still depends on app context.

#### Private run execution

- The detail panel and content rendering are reusable.
- The page owns fetching, mapping, progress persistence, and shared/private branching.

#### Shared run execution

- Shares most UI structure with private run execution.
- The logic branch is still embedded in the route-level page rather than a reusable run-execution module.

#### Import/export

- This is the least decoupled workflow.
- `TemplateBackup` contains UI, plan gating, API calls, import constraints, preview state, and result rendering in one place.

## Target Architecture

## Layering target

### 1. API adapters

Keep `src/lib/api.ts` as the transport boundary, but stop exposing it directly to pages.

Responsibilities:

- perform requests
- return transport-level results
- know endpoint paths

Not responsible for:

- toasts
- navigation
- page composition
- merging repo data
- view-specific normalization

### 2. Domain types and pure logic

Keep and expand:

- `src/types/checklist.ts`
- schema files
- normalization utilities
- progress and completion rules
- import/export constraints that are domain-valid, not UI-specific

Responsibilities:

- define shapes
- enforce pure rules
- transform data safely

### 3. Application services / use cases

Create feature-oriented service modules for:

- template library
- template detail
- template editor
- run execution
- template portability
- access and entitlements

Responsibilities:

- orchestrate adapter calls
- normalize transport shapes into domain shapes
- expose typed outcomes
- coordinate feature-level actions

They should return outcomes like:

- success payload
- recoverable failure kind
- auth required
- upgrade required
- validation issue

They should not:

- call `toast`
- navigate
- access shadcn components

### 4. Headless feature hooks / view-models

Create React hooks that sit above services and below UI:

- `useTemplateLibraryModel`
- `useTemplateDetailModel`
- `useTemplateEditorModel`
- `useRunExecutionModel`
- `useTemplatePortabilityModel`

Responsibilities:

- compose data, loading, errors, and user actions into screen-ready shape
- stay UI-kit independent

### 5. Presentational UI

Responsibilities:

- render props
- emit callbacks
- know visual states

Not responsible for:

- fetch/mutate transport
- backend mapping
- business-rule derivation beyond trivial display formatting

## Recommended feature module split

### `template-library`

- public and private list fetching
- category filtering contract
- creator/profile lookup contract

### `template-detail`

- owner/non-owner detail state
- copy/save behavior
- start-run behavior
- share behavior for owned templates

### `template-editor`

- load-for-edit
- save
- defaults and validation outcomes
- metadata vs content mode contract

### `run-execution`

- load private/shared run
- selection state
- task/subtask completion logic
- progress derivation
- complete-run action

### `template-portability`

- export options
- import preview
- import constraints
- import result contract

### `access-and-entitlements`

- auth-required outcome
- upgrade-required outcome
- billing-unavailable outcome
- login-return-path helpers at composition layer

## Refactor Backlog

## 1. Establish feature service boundaries

Primary goal:

- break `TemplatesContext` into feature-oriented application modules

Expected result:

- template and run behavior can be consumed without inheriting one giant provider

## 2. Remove direct page-to-API coupling

Target:

- no checklist/template routed page imports `api` directly

Priority routes:

- `src/views/PublicTemplate.tsx`
- `src/views/ChecklistRun.tsx`
- `src/views/TemplateDetail.tsx`
- `src/views/TemplateEditor.tsx`
- `src/views/PublicProfile.tsx`

Expected result:

- pages depend on feature hooks/services, not transport details

## 3. Centralize normalization in adapters or feature mappers

Target:

- one reusable mapping path per feature for raw API payloads

Examples to centralize:

- template response to `ChecklistTemplate`
- checklist response to `ChecklistRun`
- legacy `items` to section-based shape
- owner profile augmentation

Expected result:

- pages stop carrying backend-shape knowledge

## 4. Move side effects to the composition layer

Target:

- services and domain actions return typed outcomes
- pages or screen-level hooks decide toast and navigation

Expected result:

- feature logic becomes UI-agnostic

## 5. Create headless models for core journeys

Priority:

- template editor
- public/private template detail
- private/shared run execution
- template portability

Expected result:

- new UI can render the same workflows with a different component stack

## 6. Audit shared components for service leakage

Priority components:

- `src/components/TemplateBackup.tsx`
- `src/components/shared/AvatarUpload.tsx`
- `UserInfo.tsx` (removed 2026-09-27)

Expected result:

- shared components stop fetching or mutating directly unless they are explicitly promoted to feature containers

## 7. Resolve the duplicate API client story

Target:

- explicitly deprecate, remove, or quarantine the legacy API client (done 2026-09-27: removed)

Expected result:

- one canonical transport/client model

## 8. Document replacement-safe feature contracts

Target:

- define typed state/actions the new UI can rely on for each major feature module

Expected result:

- UI rewrite can proceed without rereading every old screen

## Exit Criteria for New UI Readiness

The checklist/template frontend is ready for a major UI replacement when all of these are true:

- No routed checklist/template page imports `api` directly.
- `TemplatesContext` is reduced to a thin composition layer or removed in favor of narrower feature modules.
- Template and run normalization exists outside pages.
- Progress and completion logic is exposed through pure helpers or headless feature models.
- Toasts are triggered at the screen/composition layer, not inside services.
- Navigation and checkout redirects are not embedded inside reusable domain/application functions.
- Shared components used across flows do not perform hidden fetch/mutate work.
- The legacy API client is resolved and no longer confuses the architecture (removed 2026-09-27).
- At least these flows can be rendered from headless state/actions without backend-route knowledge:
  - template editor
  - public/private template detail
  - private/shared run execution
  - import/export

## Recommended Next Step

The best immediate follow-up is not a large rewrite. It is a focused architecture pass on the highest-leverage bottleneck:

- extract template and run application services out of `src/contexts/TemplatesContext.tsx`

That one change will make the later UI rewrite materially easier, because nearly every checklist/template screen currently depends on that file either directly or indirectly.
