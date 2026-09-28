# Design

The UI system and the conventions that keep screens consistent. Product wording
rules are in [PRODUCT_SENSE.md](PRODUCT_SENSE.md#writing-product-copy).

## System

- **Components:** shadcn/ui (Radix primitives) vendored in `src/components/ui/`,
  configured by `components.json` (default style, slate base, CSS variables).
  Reference: [shadcn/ui docs](references/shadcn-ui-llms.txt).
- **Styling:** Tailwind CSS 3 with `tailwindcss-animate` and
  `@tailwindcss/typography`. Theme tokens are CSS variables in `src/index.css`,
  mapped in `tailwind.config.ts`. Merge classes with `cn` from `src/lib/utils.ts`.
- **Themes:** light (default) and dark, stored under `serplists-theme` and applied
  as the `dark` class on `<html>` (`src/lib/theme.ts`).
- **Icons:** `lucide-react`.
- **Feedback:** `sonner` toasts for results of user actions.
- **Console layout:** `src/components/dashboard/DashboardContentShell.tsx` provides
  `DashboardContentShell`, `DashboardPageHeader`, `DashboardToolbar`,
  `DashboardScrollArea`, `DashboardEmptyState`, and `DashboardMetricCard`. New
  console screens compose these instead of new page chrome.

## Conventions

- Use an existing primitive before adding one. Add to `src/components/ui/` only if
  the component is purely presentational (no app state, features, or API calls;
  enforced by `deps:check`).
- Every icon-only button has an `aria-label`, toggles expose `aria-pressed`, and
  inputs have a `Label`. The template grid/list toggle in `src/pages/Templates.tsx`
  is the reference.
- A control revealed on hover (`opacity-0 group-hover:opacity-100`) must also show on
  keyboard focus and on touch screens: in the template editor use
  `ROW_ACTIONS_REVEAL_CLASS` (`src/components/template-editor/reorder.ts`), and a unit
  test fails on any hover-only class string there.
- Anything that reorders by drag also reorders from the keyboard. The template
  editor's drag handles (`ReorderHandle`) move their section, task or content block
  one place with the Up and Down arrow keys, keep focus on the moved handle, and
  announce the new position. A grab cursor goes only on a handle that works.
- Show a neutral loading state rather than a guessed value (for example, never
  render a plan label before billing status loads).
- Check layouts at desktop and mobile widths with `pnpm run ui:snap` (`--mobile`).
