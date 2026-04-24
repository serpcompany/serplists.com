# Visual Parity v0 Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current SPA match the v0 reference literally across `/`, `/categories`, `/categories/business`, `/dashboard/runs`, `/dashboard/settings`, `/dashboard/templates`, `/dashboard/templates/new`, `/dashboard/templates/tpl-1`, `/dashboard/templates/tpl-1/edit`, `/profile/designops`, `/profile/designops/website-launch-checklist`, `/run/run-1`, `/share/abc123`, and `/templates` without changing route semantics or backend contracts.

**Architecture:** Drive parity from the top down. First align shared tokens, spacing, typography, containers, and route shells in the existing app; then refactor route groups onto shared presentational components that mirror the v0 structure; finally use browser-based side-by-side verification against the local v0 reference app to close remaining visual drift.

**Tech Stack:** Vite, React 18, React Router 6, Tailwind, shadcn/ui, TanStack Query, Vitest, Playwright.

---

## Scope

This plan is implementation-only. It does not ask for more audits, design exploration, or backend changes.

The parity target is the existing v0 reference at `/Users/devin/dev/repos/v0-serplists-com-v0-design`, with work organized by shared route groups:

- public landing and discovery: `/`, `/templates`, `/categories`, `/categories/business`
- public profile and template detail: `/profile/designops`, `/profile/designops/website-launch-checklist`
- dashboard inventory and settings: `/dashboard/runs`, `/dashboard/settings`, `/dashboard/templates`, `/dashboard/templates/tpl-1`
- template editor: `/dashboard/templates/new`, `/dashboard/templates/tpl-1/edit`
- run execution: `/run/run-1`, `/share/abc123`

## File Structure

### Shared foundation and routing shell

- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/components/Layout.tsx`
- Modify: `src/components/layout/page-shell.tsx`
- Modify: `src/components/layout/page-shell.styles.ts`
- Test: `tests/unit/components/Layout.test.ts`
- Test: `tests/unit/components/LayoutShell.test.tsx`
- Test: `tests/unit/pages/IndexLayout.test.tsx`
- Test: `tests/e2e/route-structure.spec.ts`

Responsibility:

- keep the current route map intact while making shell selection, page width, header behavior, and dashboard/public framing visually match the v0 reference
- ensure discovery routes stop diverging through bespoke wrappers where a shared shell is sufficient
- centralize the parity-critical tokens in one place instead of page-local overrides

### Public landing and discovery group

- Modify: `src/pages/Index.tsx`
- Modify: `src/pages/Templates.tsx`
- Modify: `src/pages/Categories.tsx`
- Modify: `src/pages/CategoryDetail.tsx`
- Modify: `src/components/checklist-library/TemplatesDiscoveryHeader.tsx`
- Modify: `src/components/checklist-library/TemplateCard.tsx`
- Modify: `src/components/checklist-library/SearchAndFilters.tsx`
- Modify: `src/components/checklist-library/CategoryNavigation.tsx`
- Test: `src/components/checklist-library/TemplatesDiscoveryHeader.test.tsx`
- Test: `src/components/checklist-library/TemplateCard.test.tsx`
- Test: `src/components/checklist-library/SearchAndFilters.test.tsx`
- Test: `tests/unit/pages/ChecklistLibrary.test.tsx`

Responsibility:

- make the discovery header, hero sections, filter toolbar, card chrome, empty states, and category surfaces render with the same layout rhythm and interaction states as v0
- avoid page-specific reimplementation where a shared discovery component can cover `/templates`, `/categories`, and `/categories/:categorySlug`

### Public profile and public template detail group

- Modify: `src/pages/UserProfile.tsx`
- Modify: `src/pages/PublicTemplate.tsx`
- Modify: `src/components/template/PublicTemplateView.tsx`
- Modify: `src/components/template/PublicTemplateContent.tsx`
- Modify: `src/components/template/TemplateActions.tsx`
- Test: `tests/unit/pages/PublicTemplate.test.tsx`
- Test: `tests/unit/components/PublicTemplateView.test.tsx`

Responsibility:

- align profile masthead, stats cards, creator card, section spacing, sticky top bar, metadata rows, and CTA placement with the v0 reference
- keep data loading and billing/login behavior in the existing models, but move parity-sensitive markup into shared template/profile presentation components

### Dashboard inventory, detail, and settings group

- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/DashboardSettings.tsx`
- Modify: `src/pages/Templates.tsx`
- Modify: `src/pages/TemplateDetail.tsx`
- Modify: `src/components/dashboard/DashboardSidebar.tsx`
- Modify: `src/components/dashboard/RunsDashboardView.tsx`
- Modify: `src/components/dashboard/TemplateCard.tsx`
- Test: `tests/unit/pages/DashboardRunsPage.test.tsx`
- Test: `tests/unit/pages/DashboardSettingsPage.test.tsx`
- Test: `tests/unit/pages/TemplatesPage.test.tsx`

Responsibility:

- make the dashboard sidebar, list/grid inventory, toolbar rows, settings tab layout, template detail header, and metric cards match v0 exactly
- converge on shared dashboard primitives so `/dashboard/runs`, `/dashboard/templates`, `/dashboard/templates/:id`, and `/dashboard/settings` no longer drift independently

### Template editor group

- Modify: `src/pages/TemplateEditor.tsx`
- Modify: `src/components/template-editor/TemplateHeader.tsx`
- Modify: `src/components/template-editor/OutlineSidebar.tsx`
- Modify: `src/components/template-editor/EditorPanels.tsx`
- Test: `tests/unit/pages/TemplateEditor.test.tsx`
- Test: `tests/unit/components/OutlineSidebar.test.tsx`
- Test: `tests/unit/components/TemplateHeader.test.tsx`
- Test: `tests/unit/components/TemplateFormPanels.test.tsx`

Responsibility:

- make `/dashboard/templates/new` and `/dashboard/templates/:id/edit` render as the same editor shell and panel composition used in the v0 reference
- keep save/load logic in current hooks, but align header sizing, panel widths, spacing, and selection behavior to the reference

### Run execution group

- Modify: `src/pages/ChecklistRun.tsx`
- Modify: `src/components/run-execution/RunProgressSidebar.tsx`
- Modify: `src/components/run-execution/TaskExecutionPanel.tsx`
- Test: `tests/unit/pages/ChecklistRunPage.test.tsx`

Responsibility:

- make private run execution and shared run execution visually converge on the v0 reference while preserving the current permission/model differences
- share the same header, content treatment, sidebar density, progress patterns, and content block presentation between `/run/:id` and `/share/:shareToken`

### Browser parity verification

- Create: `tests/e2e/visual-parity-v0.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`

Responsibility:

- codify the parity route list in one Playwright spec
- verify layout-level regressions in-browser, not just through unit snapshots or static inspection

## Task 1: Lock The Shared Visual Foundation

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/components/layout/page-shell.tsx`
- Modify: `src/components/layout/page-shell.styles.ts`
- Test: `tests/unit/components/Layout.test.ts`
- Test: `tests/unit/components/LayoutShell.test.tsx`
- Test: `tests/unit/pages/IndexLayout.test.tsx`

- [ ] Inventory the parity-critical shell differences directly from the reference routes already in scope: top-bar height, max widths, page padding, sticky behavior, card radius, border treatment, muted text contrast, and dashboard shell framing.

- [ ] Move any remaining shell-level visual decisions out of page-local JSX and into `src/index.css`, `src/components/Layout.tsx`, and `src/components/layout/page-shell.tsx` so every target route inherits the same baseline before page-specific fixes start.

- [ ] Normalize route shell selection in `src/App.tsx` and `src/components/Layout.tsx` so the target routes resolve to the correct public or dashboard frame without one-off wrappers that fight parity.

- [ ] Update layout-focused tests to assert the correct shell selection and container behavior rather than old page-specific assumptions.

Run:

```bash
pnpm run test:run -- Layout.test LayoutShell.test IndexLayout.test
```

Expected:

- the targeted shell/unit tests pass
- no route loses its expected wrapper while shared shell logic is simplified

## Task 2: Align Landing And Discovery Routes As One Route Group

**Files:**
- Modify: `src/pages/Index.tsx`
- Modify: `src/pages/Templates.tsx`
- Modify: `src/pages/Categories.tsx`
- Modify: `src/pages/CategoryDetail.tsx`
- Modify: `src/components/checklist-library/TemplatesDiscoveryHeader.tsx`
- Modify: `src/components/checklist-library/TemplateCard.tsx`
- Modify: `src/components/checklist-library/SearchAndFilters.tsx`
- Modify: `src/components/checklist-library/CategoryNavigation.tsx`
- Test: `src/components/checklist-library/TemplatesDiscoveryHeader.test.tsx`
- Test: `src/components/checklist-library/TemplateCard.test.tsx`
- Test: `src/components/checklist-library/SearchAndFilters.test.tsx`
- Test: `tests/unit/pages/ChecklistLibrary.test.tsx`

- [ ] Rebuild the landing page chrome in `src/pages/Index.tsx` to match the v0 route exactly, including header contents, hero copy layout, surface grid spacing, and lower CTA panel treatment.

- [ ] Make `src/components/checklist-library/TemplatesDiscoveryHeader.tsx` the single parity source for discovery top navigation, search slot behavior, and CTA placement across `/templates`, `/categories`, and `/categories/:categorySlug`.

- [ ] Consolidate discovery card visuals in `src/components/checklist-library/TemplateCard.tsx` and filter/search controls in `src/components/checklist-library/SearchAndFilters.tsx` so `/templates` and `/categories/business` share the same card density, badge treatment, and toolbar height as the reference.

- [ ] Trim page-local styling in `src/pages/Templates.tsx`, `src/pages/Categories.tsx`, and `src/pages/CategoryDetail.tsx` to orchestration only: hero copy, selected data, and route-specific sections should compose shared discovery pieces instead of re-styling them.

- [ ] Update the existing component/page tests so they assert parity-relevant structure: header actions, category cards, template card metadata, and expected toolbar controls.

Run:

```bash
pnpm run test:run -- ChecklistLibrary.test TemplatesDiscoveryHeader.test TemplateCard.test SearchAndFilters.test
```

Expected:

- discovery tests pass
- `/`, `/templates`, `/categories`, and `/categories/business` share the same header and card language

## Task 3: Align Public Profile And Public Template Detail Routes

**Files:**
- Modify: `src/pages/UserProfile.tsx`
- Modify: `src/pages/PublicTemplate.tsx`
- Modify: `src/components/template/PublicTemplateView.tsx`
- Modify: `src/components/template/PublicTemplateContent.tsx`
- Modify: `src/components/template/TemplateActions.tsx`
- Test: `tests/unit/pages/PublicTemplate.test.tsx`
- Test: `tests/unit/components/PublicTemplateView.test.tsx`

- [ ] Refactor `src/pages/UserProfile.tsx` so it becomes a route-level data orchestrator and lets the profile masthead, stats strip, and template grid follow the v0 hierarchy and spacing.

- [ ] Move public template parity work into `src/components/template/PublicTemplateView.tsx`, `src/components/template/PublicTemplateContent.tsx`, and `src/components/template/TemplateActions.tsx` so the sticky top bar, owner metadata, categories, expandable sections, and CTA cluster match the reference.

- [ ] Keep `src/pages/PublicTemplate.tsx` responsible for login/billing/run-save behavior only; remove any page-local layout drift that should live in the shared public template components.

- [ ] Update unit coverage so public template/profile tests lock the presence and ordering of creator metadata, actions, section rendering, and empty/not-found fallbacks.

Run:

```bash
pnpm run test:run -- PublicTemplate.test PublicTemplateView.test
```

Expected:

- public template tests pass
- `/profile/designops` and `/profile/designops/website-launch-checklist` visually read like the v0 routes, not like dashboard pages with public data

## Task 4: Align Dashboard Inventory, Detail, And Settings Routes

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/DashboardSettings.tsx`
- Modify: `src/pages/Templates.tsx`
- Modify: `src/pages/TemplateDetail.tsx`
- Modify: `src/components/dashboard/DashboardSidebar.tsx`
- Modify: `src/components/dashboard/RunsDashboardView.tsx`
- Modify: `src/components/dashboard/TemplateCard.tsx`
- Test: `tests/unit/pages/DashboardRunsPage.test.tsx`
- Test: `tests/unit/pages/DashboardSettingsPage.test.tsx`
- Test: `tests/unit/pages/TemplatesPage.test.tsx`

- [ ] Make `src/components/dashboard/DashboardSidebar.tsx` the canonical source for dashboard navigation, icon sizing, padding, and active-state styling so every dashboard route matches the v0 shell.

- [ ] Rework `src/components/dashboard/RunsDashboardView.tsx` to match the v0 header, toolbar, list item density, status icon treatment, and empty-state layout used on `/dashboard/runs`.

- [ ] Rework `src/pages/Templates.tsx` and `src/components/dashboard/TemplateCard.tsx` together so `/dashboard/templates` matches the v0 toolbar, filters, view toggles, and card/list presentation exactly.

- [ ] Rebuild the detail presentation in `src/pages/TemplateDetail.tsx` so `/dashboard/templates/tpl-1` matches the v0 title row, public/private badge treatment, action cluster, summary blocks, and section list layout while keeping the existing behavior wiring.

- [ ] Reconcile `src/pages/DashboardSettings.tsx` with the v0 structure: tab chrome, card framing, avatar block, form field grouping, and save button placement should mirror the reference instead of the current mixed-shell implementation.

- [ ] Update the existing unit suites to assert dashboard-specific parity structure instead of outdated text-only assumptions.

Run:

```bash
pnpm run test:run -- DashboardRunsPage.test DashboardSettingsPage.test TemplatesPage.test
```

Expected:

- dashboard route tests pass
- `/dashboard/runs`, `/dashboard/settings`, `/dashboard/templates`, and `/dashboard/templates/tpl-1` share one coherent v0 dashboard shell

## Task 5: Align The Template Editor Route Group

**Files:**
- Modify: `src/pages/TemplateEditor.tsx`
- Modify: `src/components/template-editor/TemplateHeader.tsx`
- Modify: `src/components/template-editor/OutlineSidebar.tsx`
- Modify: `src/components/template-editor/EditorPanels.tsx`
- Test: `tests/unit/pages/TemplateEditor.test.tsx`
- Test: `tests/unit/components/OutlineSidebar.test.tsx`
- Test: `tests/unit/components/TemplateHeader.test.tsx`
- Test: `tests/unit/components/TemplateFormPanels.test.tsx`

- [ ] Make `src/pages/TemplateEditor.tsx` responsible only for editor state orchestration, loading states, save handling, and the top-level layout grid used by both `/dashboard/templates/new` and `/dashboard/templates/:id/edit`.

- [ ] Align `src/components/template-editor/TemplateHeader.tsx` with the v0 header composition, action ordering, and title behavior so create and edit routes stop diverging.

- [ ] Align `src/components/template-editor/OutlineSidebar.tsx` and `src/components/template-editor/EditorPanels.tsx` with the v0 sidebar width, section/task density, panel spacing, and responsive collapse rules.

- [ ] Update the existing editor tests so they assert the shared create/edit structure and the expected shell-level states instead of implementation-specific DOM details.

Run:

```bash
pnpm run test:run -- TemplateEditor.test OutlineSidebar.test TemplateHeader.test TemplateFormPanels.test
```

Expected:

- editor tests pass
- `/dashboard/templates/new` and `/dashboard/templates/tpl-1/edit` become literal siblings with only data differences

## Task 6: Align Private And Shared Run Execution Routes

**Files:**
- Modify: `src/pages/ChecklistRun.tsx`
- Modify: `src/components/run-execution/RunProgressSidebar.tsx`
- Modify: `src/components/run-execution/TaskExecutionPanel.tsx`
- Test: `tests/unit/pages/ChecklistRunPage.test.tsx`

- [ ] Refactor `src/pages/ChecklistRun.tsx` into a thin route wrapper that selects run mode, owns toasts/dialogs, and passes already-derived view state into shared run-execution presentation components.

- [ ] Rebuild `src/components/run-execution/RunProgressSidebar.tsx` to match the v0 section list density, progress treatment, completion indicators, and navigation affordances.

- [ ] Rebuild `src/components/run-execution/TaskExecutionPanel.tsx` to match the v0 header row, task detail spacing, content block treatment, and previous/next navigation layout.

- [ ] Preserve the existing behavior differences for guest/shared mode, but express them through props and conditional controls instead of separate layout structures.

- [ ] Update `tests/unit/pages/ChecklistRunPage.test.tsx` so it locks the shared-vs-private run UI differences without allowing shell drift.

Run:

```bash
pnpm run test:run -- ChecklistRunPage.test
```

Expected:

- checklist run tests pass
- `/run/run-1` and `/share/abc123` look like the same product surface with permission-based control differences only

## Task 7: Browser-Based Side-By-Side Verification And Sign-Off

**Files:**
- Create: `tests/e2e/visual-parity-v0.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] Add one parity-focused Playwright spec at `tests/e2e/visual-parity-v0.spec.ts` that visits each target route in the current app and asserts the presence of the expected shared shell landmarks for that route group.

- [ ] Start the current app locally in this repo and the reference app locally in the v0 repo.

Run:

```bash
pnpm run dev
```

Expected:

- current app is available locally for browser verification

Run:

```bash
cd /Users/devin/dev/repos/v0-serplists-com-v0-design && pnpm run dev
```

Expected:

- v0 reference app is available locally for browser verification

- [ ] Open the current app and the v0 app side-by-side in a browser and verify these route pairs at desktop width, then again at a narrow mobile width:
  - current `/` vs reference `/`
  - current `/templates` vs reference `/templates`
  - current `/categories` vs reference `/categories`
  - current `/categories/business` vs reference `/categories/business`
  - current `/profile/designops` vs reference `/profile/designops`
  - current `/profile/designops/website-launch-checklist` vs reference `/profile/designops/website-launch-checklist`
  - current `/dashboard/runs` vs reference `/dashboard/runs`
  - current `/dashboard/settings` vs reference `/dashboard/settings`
  - current `/dashboard/templates` vs reference `/dashboard/templates`
  - current `/dashboard/templates/tpl-1` vs reference `/dashboard/templates/tpl-1`
  - current `/dashboard/templates/new` vs reference `/dashboard/templates/new`
  - current `/dashboard/templates/tpl-1/edit` vs reference `/dashboard/templates/tpl-1/edit`
  - current `/run/run-1` vs reference `/run/run-1`
  - current `/share/abc123` vs reference `/share/abc123`

- [ ] For each side-by-side check, confirm these parity dimensions before sign-off: shell selection, header height, max width, top/bottom spacing, card radius, borders, icon sizing, typography scale, CTA order, filter/toolbar density, and empty/loading treatment.

- [ ] Capture any remaining route-specific deltas as implementation fixes before calling parity complete; do not leave visual drift as follow-up cleanup if it affects one of the scoped routes.

Run:

```bash
pnpm run test:e2e -- --grep "visual parity|smoke"
```

Expected:

- the parity-focused Playwright checks pass
- the scoped routes have browser-confirmed visual parity against the local v0 reference

## Completion Criteria

The implementation is done only when all of the following are true:

- the scoped routes render with the correct public/dashboard/editor/run shell for their route group
- shared discovery, dashboard, template, and run components are the primary source of parity styling instead of page-local duplication
- unit coverage is updated anywhere parity work changed route structure or shared component behavior
- browser-based side-by-side verification has been completed for every scoped route against the local v0 reference app
- `tests/e2e/visual-parity-v0.spec.ts` exists and covers the scoped parity route set

## Self-Review

### Spec coverage

- required plan file path: covered by this document location
- writing-plans header and structure: included
- routes in scope: all listed explicitly in scope and verification sections
- focus on route groups and shared components: used throughout file structure and tasks
- browser-based side-by-side verification: explicit in Task 7
- no source code implementation in this document: satisfied

### Placeholder scan

No `TBD`, `TODO`, or deferred placeholders are used for scoped work. All tasks name exact repo paths and concrete verification commands.

### Type consistency

The plan consistently treats the work as route-group presentation alignment layered on top of existing page models and hooks. No new feature modules or alternate route names are introduced.

Plan complete and saved to `docs/superpowers/plans/2026-04-24-visual-parity-v0-reference.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
