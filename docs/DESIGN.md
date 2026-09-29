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
- **Feedback:** `sonner` toasts for results of user actions. The app shell
  (`src/components/AppShell.tsx`) mounts only the sonner `Toaster`, so import `toast`
  from `sonner`; ESLint blocks the shadcn toast store, which has no renderer. The
  `Toaster` is mounted before the pages because it drops toasts sent before its own
  effect runs, such as a page's first-effect notice on a full page load
  (`tests/unit/components/ToasterPlacement.test.tsx`).
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
  inputs have a `Label`. The template grid/list toggle in `src/views/Templates.tsx`
  is the reference.
- A control revealed on hover (`opacity-0 group-hover:opacity-100`) must also show on
  keyboard focus (`group-focus-within:opacity-100`) and on touch screens: use
  `HOVER_REVEAL_CLASS` (`src/components/ui/hover-reveal.ts`; the template editor's
  `ROW_ACTIONS_REVEAL_CLASS`), or hide a group only where the device can hover
  (`md:[@media(hover:hover)]:opacity-0`, as the My Templates list and Runs list rows do).
  Unit tests fail on any hover-only class string in the template editor and the
  dashboard. A hover-only duplicate of an action that is reachable elsewhere leaves
  the tab order instead (`tabIndex={-1}` inside an `aria-hidden` wrapper), like the
  Start Run overlay in `src/components/dashboard/TemplateCard.tsx` (which touch screens
  never show: `[@media(hover:none)]:hidden`) and the View Template overlay in
  `src/components/checklist-library/TemplateCard.tsx`
  (`tests/unit/components/focusVisibility.ts` finds focusable elements hidden this way).
- Anything that reorders by drag also reorders from the keyboard. The template
  editor's drag handles (`ReorderHandle`) move their section, task or content block
  one place with the Up and Down arrow keys, keep focus on the moved handle, and
  announce the new position. A grab cursor goes only on a handle that works.
- A `Label` names its control through `htmlFor` and a matching `id`, including a
  `Switch`, and helper text is linked with `aria-describedby`. Controls repeated on
  each row of a list name the row in their accessible name ("Role for Alice
  (alice@example.com)"), so no two share one; `src/components/account/SecuritySection.tsx`
  and the member list in `TeamSettingsSection.tsx` are the reference.
- Show a neutral loading state rather than a guessed value (for example, never
  render a plan label before billing status loads).
- Check layouts at desktop and mobile widths with `pnpm run ui:snap` (add `--mobile`,
  before or after the route).
- A control hidden at one width needs a way to reach it at the others. The run page's
  task column shows only at `xl`; below it, the progress block's Tasks button opens the
  same list (`RunTaskList`) in a sheet (`src/components/run-execution/MobileRunProgress.tsx`).
- Controls used again and again keep their place. The run page's task footer (Previous,
  Mark Complete, Next) is sticky at the bottom of the window, above the phone navigation
  bar, until the end of the task panel scrolls into view, so content that grows under
  the panel (the Changelog, after every save) never moves it under the pointer. A sticky
  element needs every box around it to clip (`overflow-clip`), not scroll: an
  `overflow-auto` or `overflow-hidden` ancestor holds it instead of the window
  (`src/components/run-execution/TaskExecutionPanel.tsx`).
