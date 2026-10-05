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
  Reference: [shadcn/ui docs](references/shadcn-ui-llms.txt). A primitive keeps only the
  parts screens use: `pnpm run deadcode:check` fails on an unused export, so delete the parts
  a `shadcn add` brings that nothing renders.
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
  around inline code and the bullets on task lists. Those rules sit outside any `@layer`,
  so they win over the typography plugin's own. Single newlines stay line breaks
  (`whitespace-pre-line`); `src/lib/utils/markdownWhitespace.ts` removes the newlines
  between blocks that would otherwise show as blank lines. A long word or URL wraps
  (`wrap-break-word`) instead of widening the page.
- **Themes:** light (default) and dark, stored under `serplists-theme` and applied
  as the `dark` class on `<html>` (`src/lib/theme.ts`). A change in one tab applies to
  the page in every open tab. Components follow the theme with `subscribeToThemeChanges`,
  which applies another tab's change to the document before telling them, so a label
  never disagrees with the page; do not add your own `storage` listener. Before the page
  paints, an inline script the root layout renders (`src/lib/themeBootScript.ts`) sets the
  class from the same key, so a dark-theme page never starts white; keep it in step with
  `src/lib/theme.ts`. It is a plain `<script>`, which the browser runs while it parses the
  page (`next/script`'s `beforeInteractive` would wait for Next.js's runtime to load), and
  `<html>` has `suppressHydrationWarning` because the class it sets is not in the server's
  HTML. The server cannot read the stored theme, so a component that shows
  the theme (a toggle's label) renders light first and follows the stored theme on mount.
  An icon that follows the `dark` class through CSS (`ThemeIcon`, the sun or the moon) is
  right from the first paint, so the toggle's icon never waits for its label.
- **Icons:** `lucide-react`.
- **Feedback:** `sonner` toasts for results of user actions. The app's providers
  (`src/app/providers.tsx`) mount only the sonner `Toaster`, so import `toast`
  from `sonner`; ESLint blocks the shadcn toast store, which has no renderer. The
  `Toaster` is mounted before the pages because it drops toasts sent before its own
  effect runs, such as a page's first-effect notice on a full page load
  (`tests/unit/components/ToasterPlacement.test.tsx`). A notice an effect shows takes a
  fixed `id` (the login notices), so StrictMode's second run of the effect replaces it
  instead of stacking a copy.
- **Console pages:** compose the console blocks in
  `src/components/dashboard/DashboardContentShell.tsx` (see [Console
  blocks](#console-blocks)) instead of new page chrome.
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
| `SiteNavigationMenu` | `SiteNavigationMenu.tsx` | The site's `NavigationMenu` ("Site"), from `publicHeaderItems` in `publicSiteLinks.ts`: "Templates" and "Features" open dropdowns of their pages (per link a title, which names it, and a muted description, which describes it), "Pricing" is a link. The current page's link and its menu are marked. Closed menus stay in the HTML, hidden (`keepMounted`), so crawlers find their links. It composes the root itself (shadcn's takes no `render` for the popup, so `navigation-menu.tsx` vendors none), to render Base UI's menu popup as a `div`: as a `<nav>`, whose links the trigger claims, it was an empty, unlabelled landmark |
| `SiteFooter` | `SiteFooter.tsx` | Brand and blurb, then the link columns from `publicSiteLinks.ts` (Templates, Company, Support), each titled by an `h2` |
| `AppShell` | `AppShell.tsx` | The console: `SidebarProvider`, `AppSidebar`, and a `SidebarInset` with a sticky top bar (`SidebarTrigger` and, from `md` up, the `SiteNavigationMenu` aligned right), the page and the site footer |
| `AppSidebar` | `AppSidebar.tsx` | shadcn `Sidebar`, collapsible to icons: brand and `WorkspaceSwitcher`; New Template and the console links in a `Dashboard` navigation landmark; the theme toggle and `SidebarAccountMenu`. Its rows are 44px tall, full-size targets (32px squares when collapsed). On phones it opens as its own sheet |
| `AccountMenu`, `SidebarAccountMenu` | `AccountMenu.tsx` | The signed-in user's `DropdownMenu` (console pages, Profile, Sign out), from an avatar button in the header or the sidebar footer row; both are named "Account menu" and show the user's avatar (`UserAvatar`), or their initial when they have none |
| `PageContainer`, `PageSection` | `page-shell.tsx` | The page width (`max-w-6xl`, `px-4 md:px-6`) and a band of vertical spacing |
| `PageHero` | `PageHero.tsx` | Eyebrow (a `Badge`), large title (the page's `h1`), muted description, then actions, a search (a `Field` with its visible label over a `SearchField`) and a row of chips |
| `SearchField` | `SearchField.tsx` | An `InputGroup` search input with a leading icon; the page owns the value and gives it a visible `FieldLabel` |
| `PageBreadcrumb` | `PageBreadcrumb.tsx` | shadcn's `Breadcrumb`: Home (an icon), then the trail; an item with an `href` is a link and the one without is the page. `home={false}` starts a console page's trail at its section |
| `Toolbar` | `Toolbar.tsx` | The row of filters over a list: labelled fields (search, selects) and view buttons side by side, stacked on phones (My Templates, My Runs, a category page) |
| `ViewModeToggle` | `ViewModeToggle.tsx` | The grid and list buttons over a list of Templates ("Show templates in grid view" and "in list view", pressed while on) |
| `PageEmptyState`, `PageLoadingState` | `PageState.tsx` | A public page whose record failed to load or does not exist (the shadcn `Empty` in the narrow width, its title the page's `h1`, and its actions), and one while it loads (the shadcn `Spinner` over what is loading): the public template page and a Public Profile |
| `SectionHeader` | `SectionHeader.tsx` | A section's title (with an optional eyebrow and description) and a "View all"-style link on the right; give it an `id` and its `PageSection` `aria-labelledby` to make the section a named region |
| `CardGrid` | `CardGrid.tsx` | The responsive grid: 1, 2, then 3 columns (or 2 then 4 for tiles; `columns={1}` is a list of wide cards) |
| `MediaCard` | `MediaCard.tsx` | A muted media area with an `IconTile` (and an optional corner badge or overlay), then an optional eyebrow (text only, since the title's link covers it), the title (an `h3`, or `titleAs="h2"` when the grid follows the page's `h1`) and a muted description. With `href`, the title's link covers the card; links and buttons in its children stay clickable, and so does an `action` (an actions menu) on the card's top right corner, which follows the title in the tab order. `orientation="horizontal"` makes a list row with a thumbnail |
| `ListCard` | `ListCard.tsx` | A bordered `Item` with an icon tile, title, description and trailing meta; a link when given `href`, or with `actions` (buttons on the right, under the text on phones) when not. `titleAs` makes the title a heading, for cards that are a page's sections (Contact). `orientation="vertical"` is a category tile |
| `CtaBanner` | `CtaBanner.tsx` | A muted panel: title and description on the left, buttons on the right (under them on phones) |
| `DetailPageLayout` | `DetailPageLayout.tsx` | `PageBreadcrumb` (optional, since a Public Profile has no place in a hierarchy; `breadcrumbHome={false}` starts a console page's trail at its section), the page's notices (`notice`), a header (an icon tile, or other `media` such as an avatar; the `h1` and a `subtitle`; description, meta, actions) with a panel beside it, then the content under a `Separator`: the public template page, template detail, a category page, a feature page and a Public Profile. The header is a `div`: the site header stays the page's only `<header>` |
| `IconTile`, `BrandLink` | `IconTile.tsx`, `BrandLink.tsx` | The muted icon tile (sizes `sm`, `md`, `lg`; `tone="card"` on a muted area), hidden from screen readers since its icon is decoration, and the brand mark and name |
| `Stat` | `Stat.tsx` | A figure over its muted label, with an optional icon tile: a detail page's stats panel. The figure is capitalized, so a word (a template's type) reads as a name |

Outbound links in the header and footer (`publicSiteLinks.ts`) go over https to a domain
someone has confirmed is ours, listed in `tests/unit/components/publicSiteLinks.test.ts`
(`serp.co`, `serplists.com`). Add a domain there only once it is confirmed: a test that pinned
an exact href once kept `https://serp.dr`, under a top-level domain that does not exist.

The library's `TemplateCard` (`src/components/checklist-library/TemplateCard.tsx`) is a
`MediaCard` for a public Template, and `CatalogLoadError` next to it the shadcn `Empty` for a
failed catalog (an `h2` in place of a page's first section, `titleAs="h1"` when it is the
whole page).

### Sign-in blocks

The sign-in pages and the Organization invite share one frame, shadcn's login block, in
`src/components/auth/`.

| Block | File | What it is |
| --- | --- | --- |
| `AuthCard` | `AuthCard.tsx` | A `Card` centered in the window: an icon tile, an optional eyebrow, the page's `h1` and description, the content (a form of shadcn `Field`s, or a message) and a footer line (`FieldDescription`), with an optional `aside` in a muted column beside it from `lg` (hidden below it). The Organization invite has no aside |
| `AuthPageShell` | `AuthPageShell.tsx` | `AuthCard` for Log in, Register, Forgot password and Reset password: the brand as the eyebrow and "Built for repeatable work" as the aside |
| `PasswordInput` | `PasswordInput.tsx` | A password `InputGroup` with an optional leading icon and a button that shows or hides it, named after its field ("Show password", "Hide confirm password"); each field shows or hides on its own |

### Console blocks

Console pages (under `/dashboard/`) are built from these, then shadcn components (`Card`,
`Item`, `Field`, `Alert`, `Badge`, `Progress`). The window scrolls, never a box inside the
page, so a page's sticky parts stick to the window.

| Block | File | What it is |
| --- | --- | --- |
| `DashboardContentShell` | `src/components/dashboard/DashboardContentShell.tsx` | The page: the page width (`PageContainer`, `content`, or `narrow` for a form) with its parts stacked |
| `DashboardPageHeader` | same | The page's `h1` (or `titleEditor`, a labelled field in its place while the title is renamed), a muted description and badges (`meta`), with the actions on the right (under the text on phones) |
| `DashboardPageBody` | same | The content under the header and the filters (the layout `Toolbar`) |
| `DashboardEmptyState` | same | The shadcn `Empty` with a heading: an empty list, a load error, a missing record (an `h1` when it is the whole page) |
| `DashboardLoadingState` | same | The shadcn `Spinner` over what is loading |
| `ListLoadErrorState` | `src/components/dashboard/ListLoadErrorState.tsx` | `DashboardEmptyState` for a list that failed to load: Retry, or Sign in when the session ended |
| `ConfirmDialog` | `src/components/shared/ConfirmDialog.tsx` | The shadcn `AlertDialog` for a destructive action (Delete, Revoke): Cancel and the action, which waits while it runs |
| `ShareLinkDialog` | `src/components/shared/ShareLinkDialog.tsx` | A created link in a read-only field with a Copy button |
| `TemplateSectionList` | `src/components/template/TemplateSectionList.tsx` | A Template's sections as cards (number, title, task count) over their numbered tasks; collapsible on the public template page, always open on template detail |
| `ActivityList` | `src/components/shared/ActivityList.tsx` | A record's history as `Item` rows (what changed, who, when), with its loading, error and empty lines, and "View all activity" where a page offers it: template detail, the run page and Organization activity |
| `RunPageHeader`, `SharedRunView` | `src/components/run-execution/` | The run page's header (the title, or a labelled "Run title" field while renaming; badges; progress from `xl`; the Run's actions), and the shared run page (its own header with Copy Link, a summary Card, a Card per section, the `CtaBanner`) |
| `RunWorkspace`, `GuestRunHeader`, `GuestRunSaveActions` | `src/components/run-execution/` | The run page's body (the phone progress block, the task panel and the `xl` task column), which the guest run page shares; the guest run page's header (`RunStatusMeta`'s badge and progress, "Save to account", "Complete run", "Delete run"); and saving a guest run into the account (the button, the signed-out "Log in or sign up" line, and the public template page's notice) |
| `TemplateEditorOutline` | `src/components/template-editor/TemplateEditorOutline.tsx` | Where the editor's outline sits: a sticky Card beside the form from `lg`, a bottom `Sheet` below it (opened by the editor header's Outline button; picking or adding an entry closes it and moves focus to that entry's form, while moving or removing one keeps it open). The sheet renders outside the page's locked `fieldset`, so it disables its own while a create saves or a Clipy draft generates, and it scrolls the form to the entry a frame after it closes, once its scroll lock has given the page back its scroll |

## Primitives

`src/components/ui/` holds the shadcn components and the app's own presentational blocks
built from them. Use an existing primitive before adding one, and add one there only if it is
purely presentational: no app state, features or API calls (enforced by `deps:check`).

- Add shadcn components with the CLI (`npx shadcn@latest add <name>`) and keep them as
  generated, without the comments the CLI writes: the repository's code carries none.
- Four generated components carry a change; keep it when you regenerate them.
  `CardTitle` (`card.tsx`) renders a heading, so card titles stay in the page's outline: an
  `h3`, as before the move to base-nova, unless `as` names the level where the card sits. A
  card right under the page's `h1` passes `as="h2"`, and the headings inside it move up with
  it (`tests/unit/components/ui/card.test.tsx`). `buttonVariants` (`button-variants.ts`) merges its
  classes with `cn`: unmerged, the base's `border-transparent` beats the outline variant's
  `border-border`, and a link styled as an outline button showed no border in the light
  theme (`tests/unit/components/ui/button.test.ts`). The sonner `Toaster` (`sonner.tsx`)
  follows the app's theme (`useDocumentTheme`), not next-themes. `SelectTrigger`'s icon
  (`select.tsx`) has empty children: Base UI's default "▼" would render inside the lucide
  icon as text and join the trigger's text (`tests/unit/components/ui/select.test.tsx`).
  `EmptyTitle` and `AlertTitle` render a `div`: put a heading inside when the page needs
  one, as the library's empty state does.
- shadcn's sidebar is split by responsibility to stay under 500 lines:
  `sidebar-provider.tsx` (the provider, its cookie and the keyboard shortcut),
  `use-sidebar.ts` (the context and `useSidebar`), `sidebar-menu.tsx` (the menu parts) and
  `sidebar.tsx` (the rest), which re-exports the provider and the menu parts. Import the
  components from `sidebar` and `useSidebar` from `use-sidebar`. The provider reads the phone
  width with `useMediaQuery`, as the views do.
- The app's own: `FileUpload` (`file-upload.tsx`, with the upload and its toasts in
  `file-upload-flow.ts`), `EmbedField` ([embed blocks](design-docs/template-content-types.md#embed-blocks)),
  `RunNameDialog` (the [Start a Run dialog](design-docs/ui-screen-inventory.md#start-a-run-dialog)),
  `Tags` (a multi-select: removable badges over a searchable popover; its `id` goes on the
  trigger, so a `Label` names the picker) and `HOVER_REVEAL_CLASS` (below). A primitive
  cannot read the session, so `FileUpload` uploads only when its page passes `signedIn`; the
  API files the upload under the session's user.

## Conventions

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
  inputs have a `Label`. The template grid/list toggle (`ViewModeToggle`) is the
  reference.
- Every field shows its label, on phones too: a `FieldLabel` bound to the field, never only
  a placeholder or an `aria-label` (a hero's search too: "Search categories", "Search
  templates").
- A page has one `h1` and its headings never skip a level: someone who moves through a page
  by its headings loses where its sections start when an `h3` follows the `h1`. A card, grid
  or section right under the `h1` titles itself with an `h2` (`CardTitle as="h2"`,
  `titleAs="h2"` on `MediaCard`, `ListCard` and `CtaBanner`), and the headings inside it
  follow one level down. `tests/e2e/heading-outline.spec.ts` reads the outline of the public
  and console pages from the headings a screen reader reads: rendered, and outside
  `aria-hidden`.
- A control revealed on hover (`opacity-0 group-hover:opacity-100`) must also show on
  keyboard focus (`group-focus-within:opacity-100`) and on touch screens: use
  `HOVER_REVEAL_CLASS` (`src/components/ui/hover-reveal.ts`; the template editor's
  `ROW_ACTIONS_REVEAL_CLASS`), or hide a group only where the device can hover
  (`md:[@media(hover:hover)]:opacity-0`, as the My Templates list and Runs list rows do).
  Unit tests fail on any hover-only class string in the template editor and the
  dashboard. A hover-only duplicate of an action that is reachable elsewhere leaves
  the tab order instead (`tabIndex={-1}` inside an `aria-hidden` wrapper), like the
  Start Run overlay in `src/components/dashboard/TemplateCard.tsx` (which touch screens,
  where a tap can leave `:hover` stuck, never show: `[@media(hover:none)]:hidden`; there the
  card's actions menu starts a run) and the View Template overlay in
  `src/components/checklist-library/TemplateCard.tsx`
  (`tests/unit/components/focusVisibility.ts` finds focusable elements hidden this way).
- Anything that reorders by drag also reorders from the keyboard and by touch. The
  template editor's drag handles (`ReorderHandle`) move their section, task or content
  block one place with the Up and Down arrow keys, keep focus on the moved handle, and
  announce the new position. HTML5 drag and drop needs a mouse, so on a coarse pointer (a
  touch screen) the handle hides (`pointer-coarse:hidden`) and each entry shows Move up and
  Move down buttons (`ReorderMoveButtons`), which move it one place, keep focus on the moved
  entry's button and announce the new position; a fine pointer hides them
  (`pointer-fine:hidden`). A grab cursor goes only on a handle that works. A move can
  re-insert the moved row, which drops focus, so focus returns to its handle or button once
  the move has rendered, and to its other Move button when the move reached the end of the
  list (`src/components/template-editor/reorder.ts`). A list takes a drop only from a drag
  that started on one of its own handles: blocks within their task, sections among
  sections, and tasks within their section. A drag puts its entry in the drag data as it
  starts, since Firefox starts no drag without data.
- A `Label` names its control through `htmlFor` and a matching `id`, including a
  `Switch`, and helper text is linked with `aria-describedby`. Controls repeated on
  each row of a list name the row in their accessible name ("Role for Alice
  (alice@example.com)"), so no two share one; `src/components/account/SecuritySection.tsx`
  and the member list in `OrganizationMemberList.tsx` are the reference. The member list
  shows its Role and Status labels only on phones, where a row's fields stack under the
  member (`sm:sr-only`); from `sm` the row reads as one line, and the controls' names say
  whose role and status they are.
- Show a neutral loading state rather than a guessed value (for example, never
  render a plan label before billing status loads).
- Check layouts at desktop and mobile widths with `pnpm run ui:snap` (add `--mobile`,
  before or after the route).
- A control hidden at one width needs a way to reach it at the others. The run page's
  task column shows only at `xl`; below it, the progress block's Tasks button opens the
  same list (`RunTaskList`) in a sheet (`src/components/run-execution/MobileRunProgress.tsx`).
  The template editor's outline sits beside the form from `lg`; below it, the editor
  header's Outline button opens it in a sheet (`TemplateEditorOutline`), and Preview moves
  into the header's More actions on phones.
- A layout whose structure (not only its styling) changes at a breakpoint reads the width
  with `useMediaQuery` (`src/lib/useMediaQuery.ts`), which renders its server value until
  the browser answers, so the page never mounts both layouts; the editor renders the
  outline's Card or its Sheet this way. Plain CSS breakpoints stay the default.
- Controls used again and again keep their place. The run page's task footer (Previous,
  Mark Complete, Next) is sticky at the bottom of the window until the end of the task
  panel scrolls into view, so content that grows under the panel (the Activity, after
  every save) never moves it under the pointer. The panel is at least the window's height
  under the top bar, so the footer starts at the bottom of the window even on a short task.
  A sticky element needs every box around it to clip (`overflow-clip`), not scroll: an
  `overflow-auto` or `overflow-hidden` ancestor holds it instead of the window
  (`src/components/run-execution/TaskExecutionPanel.tsx`).
- A double click acts once. Its second click lands on whatever is under the pointer by
  then, and a click's `detail` counts the clicks (0 for the keyboard and for programmatic
  clicks), so the helpers in `src/lib/utils/repeatClick.ts` tell the repeat apart. A
  control that changes what it does after a click (Next Task becoming the next task's
  Mark Complete, Rename becoming Save title) takes `onSingleClick`. A dialog that a click
  opens passes `createJustOpenedGuard`'s `markOpened` as its popup's ref and calls
  `onOutsidePress` from `onOpenChange` when it closes for an outside press, so the rest of
  the double click, landing on its overlay, does not close it. A page that scrolls under
  the pointer (the run page moving to another task) calls
  `ignoreRepeatClicksBriefly(window)`, which swallows repeat clicks in the capture phase,
  before any control acts. Those two last `DOUBLE_CLICK_MS`, 500 ms, the longest
  double-click interval browsers use (the Windows default). An action that must not run
  twice (a save, an export) goes through `createSingleFlight`
  (`src/lib/utils/singleFlight.ts`; `useSingleFlight` for a button), which sets its guard
  synchronously, before React can re-render the button as disabled, and clears it however
  the action ends. A list whose rows can each run the action at the same time (Restore on
  the archive page, Revalidate on the runs list) keeps the ids in flight in a ref, checked
  and set before the request for the same reason, and the same ids in state to disable
  each row's button (`useArchiveRecovery`, `useRunRevalidation`).
- Write a count with its noun through `formatCount` or `pluralize`
  (`src/lib/utils/pluralize.ts`): "1 template", "2 templates", "0 tasks", never
  "1 templates".
