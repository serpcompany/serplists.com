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
- Show a neutral loading state rather than a guessed value (for example, never
  render a plan label before billing status loads).
- Check layouts at desktop and mobile widths with `pnpm run ui:snap` (`--mobile`).
- A control hidden at one width needs a way to reach it at the others. The run page's
  task column shows only at `xl`; below it, the progress block's Tasks button opens the
  same list (`RunTaskList`) in a sheet (`src/components/run-execution/MobileRunProgress.tsx`).
