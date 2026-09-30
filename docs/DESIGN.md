# Design

The UI system and the conventions that keep screens consistent. Product wording
rules are in [PRODUCT_SENSE.md](PRODUCT_SENSE.md#writing-product-copy).

The brief: Next.js, shadcn components in their default style (base-nova, neutral), modular
and reusable blocks, no custom design. Page layouts follow https://aiuxplayground.com/. The
[UI app map](design-docs/ui-app-map.md) lists every screen and flow, and the [UI screen
inventory](design-docs/ui-screen-inventory.md) holds each screen's spec card, the reference
pattern it follows, and its proof pass (SERP's UI runbook).

## System

- **Components:** shadcn/ui vendored in `src/components/ui/`, configured by
  `components.json` (style `base-nova` on Base UI primitives, base color `neutral`, CSS
  variables, `lucide` icons), as in the approved zenbujapanese.com stack.
  Reference: [shadcn/ui docs](references/shadcn-ui-llms.txt).
- **Styling:** Tailwind CSS 4 with `tw-animate-css`, `shadcn/tailwind.css` and
  `@tailwindcss/typography`, all loaded by `src/app/globals.css`, which holds the shadcn
  default theme tokens (neutral, light and dark) unchanged: no custom colors, fonts, radii
  or effects. There is no `tailwind.config` file. Merge classes with `cn` from
  `src/lib/utils.ts` (the `cn` package).
- **Fonts:** Geist and Geist Mono through `next/font/google` in the root layout
  (`src/app/layout.tsx`), exposed as `--font-sans` and `--font-geist-mono`.
- **Markdown text:** `MarkdownBlock` (`src/components/shared/MarkdownBlock.tsx`) renders
  every Markdown block with `prose prose-sm`. `src/app/globals.css` points the prose colors
  at the theme tokens, so no `dark:prose-invert` is needed, and turns off the backticks
  around inline code and the bullets on task lists. Single newlines stay line breaks
  (`whitespace-pre-line`); `src/lib/utils/markdownWhitespace.ts` removes the newlines
  between blocks that would otherwise show as blank lines.
- **Themes:** light (default) and dark, stored under `serplists-theme` and applied
  as the `dark` class on `<html>` (`src/lib/theme.ts`). A change in one tab applies to
  the page in every open tab. Components follow the theme with `subscribeToThemeChanges`,
  which applies another tab's change to the document before telling them, so a label
  never disagrees with the page; do not add your own `storage` listener. Before the page
  paints, an inline script the root layout renders (`src/lib/themeBootScript.ts`) sets the
  class from the same key, so a dark-theme page never starts white; keep it in step with
  `src/lib/theme.ts`. The server cannot read the stored theme, so a component that shows
  the theme (a toggle's label) renders light first and follows the stored theme on mount.
- **Icons:** `lucide-react`.
- **Feedback:** `sonner` toasts for results of user actions. The app's providers
  (`src/app/providers.tsx`) mount only the sonner `Toaster`, so import `toast`
  from `sonner`; ESLint blocks the shadcn toast store, which has no renderer. The
  `Toaster` is mounted before the pages because it drops toasts sent before its own
  effect runs, such as a page's first-effect notice on a full page load
  (`tests/unit/components/ToasterPlacement.test.tsx`).
- **Console pages:** `src/components/dashboard/DashboardContentShell.tsx` provides
  `DashboardContentShell`, `DashboardPageHeader`, `DashboardToolbar`,
  `DashboardScrollArea`, `DashboardEmptyState`, and `DashboardMetricCard`. New
  console screens compose these instead of new page chrome.
- **Public header on phones:** below `md` the public shell hides its navigation, Log in
  and the theme switch, and `src/components/layout/PublicMobileNav.tsx` shows them in a
  sheet built from `publicHeaderItems` (each header menu becomes a labelled group of its
  links), so a new header link reaches phones too. Its button sits before the brand. The
  console shell opens its sidebar as a sheet instead.

## Shells and layout blocks

Pages compose these blocks from `src/components/layout/`; they add no text of their own,
and a page adds no one-off styling around them. Each is built from shadcn components.

| Block | File | What it is |
| --- | --- | --- |
| Shell switch | `src/components/Layout.tsx` | Picks the console shell or the public shell from the path, unless it is given one: the 404 page's `NotFoundLayout` (`src/components/NotFoundLayout.tsx`) gives the console shell only to a signed-in user on a missing console path, after the session check |
| `SiteHeader` | `SiteHeader.tsx` | Sticky header: `BrandLink`, the `SiteNavigationMenu`, the theme toggle, Log in and Get started or the `AccountMenu`, and `PublicMobileNav` (a `Sheet`) below `md` |
| `SiteNavigationMenu` | `SiteNavigationMenu.tsx` | The site's `NavigationMenu` ("Site"), from `publicHeaderItems` in `publicSiteLinks.ts`: "Templates" and "Features" open dropdowns of their pages (a title and a muted description per link), "Pricing" is a link. The current page's link and its menu are marked. Closed menus stay in the HTML, hidden (`keepMounted`), so crawlers find their links. It composes shadcn's root itself to render Base UI's menu popup as a `div`: as a `<nav>`, whose links the trigger claims, it was an empty, unlabelled landmark |
| `SiteFooter` | `SiteFooter.tsx` | Brand and blurb, then the link columns from `publicSiteLinks.ts` (Templates, Company, Support) |
| `AppShell` | `AppShell.tsx` | The console: `SidebarProvider`, `AppSidebar`, and a `SidebarInset` with a sticky top bar (`SidebarTrigger` and, from `md` up, the `SiteNavigationMenu` aligned right), the page and the site footer |
| `AppSidebar` | `AppSidebar.tsx` | shadcn `Sidebar`, collapsible to icons: brand and `WorkspaceSwitcher`; New Template and the console links in a `Dashboard` navigation landmark; the theme toggle and `SidebarAccountMenu`. Its rows are 44px tall, full-size targets (32px squares when collapsed). On phones it opens as its own sheet |
| `AccountMenu`, `SidebarAccountMenu` | `AccountMenu.tsx` | The signed-in user's `DropdownMenu` (console pages, Profile, Sign out), from an avatar button in the header or the sidebar footer row; both are named "Account menu" |
| `PageContainer`, `PageSection` | `page-shell.tsx` | The page width (`max-w-6xl`, `px-4 md:px-6`) and a band of vertical spacing |
| `PageHero` | `PageHero.tsx` | Eyebrow (a `Badge`), large title, muted description, then actions, a `SearchField` and a row of chips |
| `SearchField` | `SearchField.tsx` | An `InputGroup` search input with a leading icon; the page owns the value |
| `SectionHeader` | `SectionHeader.tsx` | A section's title (with an optional eyebrow and description) and a "View all"-style link on the right; give it an `id` and its `PageSection` `aria-labelledby` to make the section a named region |
| `CardGrid` | `CardGrid.tsx` | The responsive grid: 1, 2, then 3 columns (or 2 then 4 for tiles) |
| `MediaCard` | `MediaCard.tsx` | A muted media area with an `IconTile` (and an optional corner badge or overlay), then the title and a muted description. With `href`, the title's link covers the card; links and buttons in its children stay clickable. `orientation="horizontal"` makes a list row with a thumbnail |
| `ListCard` | `ListCard.tsx` | A bordered `Item` with an icon tile, title, description and trailing meta; a link when given `href`. `orientation="vertical"` is a category tile |
| `CtaBanner` | `CtaBanner.tsx` | A muted panel: title and description on the left, buttons on the right |
| `DetailPageLayout` | `DetailPageLayout.tsx` | `Breadcrumb` (Home, then the trail), a header (icon tile, title, description, meta, actions) with a panel beside it, then the content under a `Separator` |
| `IconTile`, `BrandLink` | `IconTile.tsx`, `BrandLink.tsx` | The muted icon tile (sizes `sm`, `md`, `lg`; `tone="card"` on a muted area) and the brand mark and name |

`Surface` (in `page-shell.tsx`) gives pages not yet rebuilt from these blocks the Card
surface; step 2 of the restyle replaces it. The library's `TemplateCard`
(`src/components/checklist-library/TemplateCard.tsx`) is a `MediaCard` for a public
Template.

## Conventions

- Use an existing primitive before adding one. Add to `src/components/ui/` only if
  the component is purely presentational (no app state, features, or API calls;
  enforced by `deps:check`). Add shadcn components with the CLI
  (`npx shadcn@latest add <name>`) and keep them as generated.
- Three generated components carry a change; keep it when you regenerate them.
  `CardTitle` (`card.tsx`) renders an `h3`, as it did before the move to base-nova, so card
  titles stay in the page's outline. The sonner `Toaster` (`sonner.tsx`) follows the app's
  theme (`useDocumentTheme`), not next-themes. `SelectTrigger`'s icon (`select.tsx`) has
  empty children: Base UI's default "▼" would render inside the lucide icon as text and
  join the trigger's text (`tests/unit/components/ui/select.test.tsx`). `EmptyTitle` and
  `AlertTitle` render a `div`: put a heading inside when the page needs one, as the
  library's empty state does.
- Base UI, not Radix: compose with the `render` prop (`<DropdownMenuTrigger
  render={<Button variant="ghost" />}>`, `<DropdownMenuItem render={<Link href=... />}>`).
  A link that looks like a button stays a link: `<Link className={buttonVariants(...)}>`
  (Base UI's `Button` gives whatever it renders button semantics).
- A `Select` shows its raw value unless it knows the labels: pass `items` (a value to label
  map) or a function child to `SelectValue`. `onValueChange` may pass `null`.
- A `DropdownMenuLabel` must sit inside a `DropdownMenuGroup`.
- `AlertDialogAction` is a plain button: close the dialog yourself when the action should
  close it (control `open`).
- A `Switch` or `Checkbox` renders a `<span>` with a hidden input, which a sibling
  `<Label htmlFor>` cannot name. Render it as a native button (`nativeButton
  render={<button type="button" />}`) when a sibling label names it, as the Settings,
  Import and editor switches do.
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
  Mark Complete, Next) is sticky at the bottom of the window until the end of the task
  panel scrolls into view, so content that grows under the panel (the Changelog, after
  every save) never moves it under the pointer. A sticky element needs every box around it
  to clip (`overflow-clip`), not scroll: an `overflow-auto` or `overflow-hidden` ancestor
  holds it instead of the window (`src/components/run-execution/TaskExecutionPanel.tsx`).
