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
- **Markdown text:** `MarkdownBlock` (`src/components/shared/MarkdownBlock.tsx`) renders
  every Markdown block with `prose prose-sm`. `tailwind.config.ts` points the prose colors
  at the theme tokens, so no `dark:prose-invert` is needed, and turns off the backticks
  around inline code and the bullets on task lists. Single newlines stay line breaks
  (`whitespace-pre-line`); `src/lib/utils/markdownWhitespace.ts` removes the newlines
  between blocks that would otherwise show as blank lines.
- **Themes:** light (default) and dark, stored under `serplists-theme` and applied
  as the `dark` class on `<html>` (`src/lib/theme.ts`). A change in one tab applies to
  the page in every open tab. Components follow the theme with `subscribeToThemeChanges`,
  which applies another tab's change to the document before telling them, so a label
  never disagrees with the page; do not add your own `storage` listener. Before the app
  loads, an inline script in `index.html` sets the class from the same key, and the boot
  splash has `html.dark` colors (hex copies of the `.dark` `--background` and
  `--foreground` tokens), so a dark-theme page never starts white. Keep those in step with
  `src/index.css` and `src/lib/theme.ts` (`tests/unit/boot/bootSplashTheme.test.ts`).
- **Icons:** `lucide-react`.
- **Feedback:** `sonner` toasts for results of user actions. `App.tsx` mounts only the sonner
  `Toaster`, so import `toast` from `sonner`; ESLint blocks the shadcn toast store, which has no renderer.
- **Console layout:** `src/components/dashboard/DashboardContentShell.tsx` provides
  `DashboardContentShell`, `DashboardPageHeader`, `DashboardToolbar`,
  `DashboardScrollArea`, `DashboardEmptyState`, and `DashboardMetricCard`. New
  console screens compose these instead of new page chrome.
- **Public header on phones:** below `md` the public shell hides its nav links, Log in
  and the theme switch, and `src/components/layout/PublicMobileNav.tsx` shows them in a
  menu built from `publicHeaderLinks`, so a new header link reaches phones too. The
  console shell uses its own `MobileNav` instead.

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
