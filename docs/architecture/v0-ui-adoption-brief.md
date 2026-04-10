# v0 Frontend Adoption Brief

This document explains how to use the returned frontend repo as a presentation-layer reference without letting it distort core service architecture or backend contracts.

Reference repo:

- `https://github.com/devinschumacher/v0-serplists-com-v0-design`

## Executive Summary

The returned frontend is useful as:

- a component-system reference
- a theme and token reference
- a layout and interaction-pattern reference
- a quality-guidelines reference
- a strong starting point for the new frontend direction

It is **not** a source of truth for:

- backend contracts
- auth model
- service boundaries
- checklist/template domain shapes

The most important conclusion:

- the repo is still fundamentally `shadcn/ui`-based
- the value is not “replace shadcn with a new component library”
- the value is “adopt a better design system, theme, and component vocabulary on top of shadcn primitives”
- the returned frontend should be treated as a high-quality starting point, not as a finished implementation
- we should plan to QC it and fix issues before treating it as the presentation baseline

## What the Returned Frontend Gives Us

## 1. A clearer presentation-system stack

The repo is built with:

- `Next.js 16`
- `React 19`
- `Tailwind CSS v4`
- `shadcn/ui`
- `Radix`
- `Geist` and `Geist Mono`

For our purposes, the portable ideas are:

- semantic design tokens
- stricter component vocabulary
- grouped feature components
- better quality/lint rules for presentation

The non-portable parts are:

- App Router specifics
- Next-specific file layout
- any assumptions tied to Next runtime behavior

## 2. A stronger semantic token system

The most useful asset in the repo is `app/globals.css`.

It defines a clearer token model using CSS variables and semantic names:

- `--background`
- `--foreground`
- `--card`
- `--popover`
- `--primary`
- `--secondary`
- `--muted`
- `--accent`
- `--destructive`
- `--border`
- `--input`
- `--ring`
- `--sidebar-*`
- `--success`

Key theme characteristics:

- dark neutral base
- high-contrast foreground
- restrained grayscale surfaces
- green success accent
- semantic tokens mapped into Tailwind theme variables
- one radius scale anchored by `--radius`

Portable recommendation:

- adopt the semantic-token model and naming conventions
- do not hardcode black/white/gray utility classes in new feature work

## 3. A more deliberate component vocabulary

The returned repo organizes custom components by feature area:

- `components/template-editor`
- `components/run-execution`
- `components/discovery`
- `components/dashboard`
- `components/modals`
- `components/forms`
- `components/ui`

This is useful because it separates:

- base UI primitives
- feature-specific composite components
- app-shell/navigation pieces

Portable recommendation:

- keep `components/ui` for primitive wrappers
- introduce feature-grouped component folders for the new frontend work
- avoid putting feature logic into generic shared components

## 4. Better empty-state and docs-driven design patterns

The repo includes:

- reusable empty-state components in `components/empty-states.tsx`
- design-system documentation under `app/docs`
- explicit architecture explanation in the design docs

The strongest pattern here is not the exact visuals. It is the habit of:

- making empty states first-class
- documenting layout and token rules
- creating feature-level UI patterns intentionally

Portable recommendation:

- adopt reusable empty-state primitives
- keep internal docs for token rules, layout conventions, and component patterns

## What We Should Adopt

## 1. Semantic theme tokens

Adopt the token strategy from the prototype, especially:

- semantic surface roles instead of direct colors
- a dedicated `success` token
- explicit `sidebar` token family
- centralized radius variables

Why:

- this gives us a stable theme layer even if the component stack changes later

## 2. Presentation guidelines from the prototype README and docs

The returned repo’s guidance is directionally good:

- use semantic colors, not direct utility colors
- prefer `gap-*` over `space-*`
- avoid floats
- use spacing and typography scales instead of arbitrary values
- document layout patterns

Portable recommendation:

- fold these into our own frontend guidelines
- enforce them on new UI work where practical

## 3. Feature-oriented UI component groupings

Adopt the idea of separate feature component families:

- template editor components
- run execution components
- discovery components
- dashboard components

Why:

- this matches how designers think
- it also keeps presentation work from collapsing into one huge `components/` folder

## 4. A small set of custom UI composites on top of shadcn

Examples implied by the prototype:

- empty-state primitives
- sticky headers for operational views
- structured sidebars
- preview cards
- design-doc wrappers

Portable recommendation:

- build a thin custom design system layer above shadcn instead of trying to replace every primitive immediately

## 5. Quality enforcement for presentation work

The prototype’s `docs/QUALITY_ENFORCEMENT.md` is useful as a UI-discipline reference.

Good candidates to adopt:

- semantic-color enforcement
- banning `space-*` in favor of `gap-*`
- discouraging arbitrary spacing and typography values
- responsive checks for major product screens
- accessibility checks for critical flows

## What We Should Not Adopt Blindly

## 1. API contracts

The prototype includes `docs/API_CONTRACTS.md`, but it should not be treated as our backend spec.

Reasons:

- it assumes `Bearer` token auth
- our current app uses Better Auth cookie sessions
- several shapes diverge from our domain names and nested model

Examples of mismatch:

- prototype uses `Task[]` and `contentBlocks`
- our app uses `items` and `contents`
- prototype uses `subtasks`
- our app uses `subItems`
- prototype uses `GET /runs`, `POST /runs`
- our current app is built around `/checklists` endpoints

Conclusion:

- use that file only as an example of frontend-backend contract documentation style
- do not adopt it as the actual contract

## 2. Domain type names and structures

The prototype’s type names are not the same as our current source-of-truth shapes.

Do not let the UI prototype rename our domain model before we make an explicit product/domain decision.

Our current source of truth remains:

- `src/types/checklist.ts`
- `src/lib/schemas/checklistSchema.ts`

## 3. Route structure as backend truth

The prototype has its own route organization:

- `/run/[id]`
- `/share/[token]`
- `/dashboard/templates`
- `/templates`
- `/profile/[username]`

Some of this aligns with our product, but route naming in the prototype should not force backend or service architecture decisions.

Use it only as:

- a page-structure reference
- a navigation reference
- a component-grouping reference

## 4. Auth assumptions

The prototype assumes a token-based frontend/backend contract.

We should not inherit:

- bearer token assumptions
- `/users/me` assumptions
- auth flow semantics that do not match Better Auth cookie sessions

## Component/Theme Adoption Recommendations

## Adopt directly or nearly directly

### Theme layer

- semantic CSS variable naming
- dark neutral palette
- green success accent
- sidebar token family
- Geist font pairing if it fits the new direction

### Layout conventions

- sticky operational headers
- clear separation between:
  - app shell
  - page header
  - content area
  - sidebars/panels
- strong empty-state components

### Feature component categories

- `template-editor`
- `run-execution`
- `discovery`
- `dashboard`

### Quality rules

- semantic color use
- `gap-*` over `space-*`
- reduced arbitrary utility values
- responsive checks for primary product surfaces

## Adopt selectively

### Specific composite components

These component names are good references but should be rebuilt around our app’s real flows:

- `editor-header`
- `outline-sidebar`
- `editor-panels`
- `run-header`
- `run-progress-sidebar`
- `task-execution-panel`
- `discovery-header`
- `template-preview-card`

Why selective:

- the visual/system idea is useful
- the exact props and behavior should come from our real product model

## Do not adopt as-is

### API contract docs

- use as format inspiration only

### Domain types from the prototype

- keep our current checklist/template/run types as source of truth

### Next-specific app structure

- useful as inspiration, not a required migration target

## How This Should Affect Our Current Work

## 1. Core decoupling work should remain UI-agnostic

The audit and decoupling checklist still stand.

Do not change core service boundaries because of the prototype.

Those boundaries should still be based on product capabilities:

- template library
- template detail
- template editor
- run execution
- sharing
- portability
- access/entitlements

## 2. The prototype should guide the presentation layer

Use the returned frontend to define:

- new theme tokens
- new design conventions
- new custom component vocabulary
- new layout primitives
- new quality standards for UI implementation

## 3. Headless hooks and screen composition can later align to the new UI

Once the decoupling foundation is in place, the prototype can help shape:

- view-model boundaries
- page-level composition
- reusable shell patterns
- modal and empty-state patterns

## Recommended Immediate Actions

## Action 1: Treat the returned repo as a presentation reference only

Decision:

- `Yes`

## Action 2: Run a QC pass on the returned frontend before adopting it as the baseline

Decision:

- `Required`

QC pass should cover:

- product-flow mismatches against the real app
- domain/type mismatches against our current source of truth
- missing states and edge cases
- accessibility gaps
- responsive issues
- places where the frontend assumes the wrong backend or auth contract

Reason:

- the repo is a great starting point, but it still needs validation and corrective work before we build around it

### Action 3: Extract a minimal internal design-system adoption checklist

Include:

- semantic token names to adopt
- banned utility patterns to avoid
- feature component folder conventions
- responsive and accessibility expectations

## Action 4: Do not let prototype API docs override our current contracts

Decision:

- `Required`

## Action 5: Use the prototype to guide the new component/theme layer once decoupling starts landing

Decision:

- `Yes`

## Bottom Line

The returned frontend gives us the new:

- component vocabulary
- theme direction
- token system
- UI quality guidelines
- a strong starting point for the next frontend iteration

It does **not** give us the new:

- service architecture
- domain model
- backend contract

And before we adopt it as the baseline, we should explicitly QC it and fix the issues we find.

That is the correct split.
