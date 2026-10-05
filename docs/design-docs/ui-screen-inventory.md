# UI screen inventory

Phases 2 and 3 of the UI runbook for the web app: a spec card for every screen and overlay in
the [UI app map](ui-app-map.md), with its structure extraction. The design reference is
https://aiuxplayground.com/. Its screenshots are named by file below (for example
home-1.png): 1440×900 slices of the site and one 390px phone shot (home-mobile.png). They
are kept outside the repository.

Step 1 restyled the public shell, the signed-in shell, Home, the Template Library and the
public template page with the shared blocks (listed in
[DESIGN.md](../DESIGN.md#shells-and-layout-blocks)). Step 2 restyled the rest: step 2a the
signed-in console, the shared run and their overlays, step 2b the other public pages, the
sign-in pages, the Organization invite and the 404 page.

## How to read a card

- The fields follow the runbook's template: SCREEN NAME, PURPOSE, HOW USER GETS HERE, WHAT'S
  ON THE SCREEN, PRIMARY ACTION, SECONDARY ACTIONS, STATES, NAVIGATION TYPE, PATTERN CHOICE,
  REFERENCE IMAGES, STRUCTURE, PROOF PASS, NOTES. Its PLATFORM NOTE is left out: this is a
  web app. Navigation types are defined in the [app map](ui-app-map.md#navigation-types).
- WHAT'S ON THE SCREEN and STATES describe the code today. Quoted words are the labels the
  app shows.
- PATTERN CHOICE names a [reference pattern](#reference-patterns). It is decided on a step 1
  card and built on a step 2 card; the one proposal left is the browser's own confirm
  prompts, which stay the browser's.
- STRUCTURE (phase 3) lists layout zones, component types and data fields: what the step
  built.
- PROOF PASS is the runbook's phase 5 check against the reference images: structural
  differences only (layout zones, component types, hierarchy, missing sections), not color
  or imagery. A step 1 card gives the result and the screenshots it was checked on. They
  are saved locally in `tmp/design-review/step1/` (git ignores it) as
  `<screen>-<desktop|mobile>-<light|dark>-<signed-in|signed-out>.png`: full pages at
  1440x900 and 390x844. A step 2a card does the same with the screenshots in
  `tmp/design-review/step2-console/` (also ignored), named
  `<screen>[-<state>]-<desktop|mobile>-<light|dark>.png`: full pages, or the window for an
  overlay, a loading state and the run page (whose footer sticks to the window), each with
  its accessibility tree beside it (`.aria.yml`). The phone shots keep the touch screen's
  coarse pointer, so they show what a phone shows. A step 2b card does the same with the
  screenshots in `tmp/design-review/step2-public/` (also ignored): signed out unless the
  name says `-signed-in`, and each state a script set up (a hanging request for loading, a
  failed one for an error, an invite or a billing status answered by the script) is named on
  its card.

## Reference patterns

Structure only, from the screenshots: no color, brand or imagery. USED BY names the app
screens that follow the pattern (decided for step 1, built in step 2).

### Site header

- **SCREENSHOTS:** every shot; home-1.png (top of the page), home-2.png (scrolled),
  home-mobile.png (phone).
- **LAYOUT ZONES:**
  - A full-width bar pinned to the top of the window, its content aligned to the page
    container. A hairline bottom border shows once the page scrolls (home-2.png).
  - Left: brand (logo mark and a two-line wordmark), a link home.
  - Center: navigation with 4 items: 2 plain links and 2 dropdown triggers with a chevron.
  - Right: a round outline icon button (search), then a pill-shaped primary button.
  - Phone (home-mobile.png): menu icon button on the left, brand, primary pill button on the
    right. No navigation items.
- **COMPONENT TYPES:** navigation link; navigation dropdown trigger; round icon button; pill
  primary button; menu icon button.
- **DATA FIELDS:** brand name; navigation item label (and its menu for a dropdown); primary
  button label.
- **USED BY:** [Public shell](#public-shell).

### Page hero

- **SCREENSHOTS:** home-1.png, patterns-1.png, prompts-1.png, teardowns-1.png,
  home-mobile.png.
- **LAYOUT ZONES:** a centered column below the header, with generous space above. Title
  (1–2 lines, very large, tight line height and letter spacing). Subtitle (2–3 lines, muted,
  narrower than the title). Optional: a wide search input (patterns-1.png, prompts-1.png), a
  block of centered chip rows (prompts-1.png), a row of tiles (home-1.png).
- **COMPONENT TYPES:** heading; muted paragraph; search input with a leading search icon;
  chip (filled, muted, rounded); tile row.
- **DATA FIELDS:** title; subtitle; search placeholder; chip labels.
- **USED BY:** [Home](#home), [Template Library](#template-library) (decided);
  [Categories](#categories), [Features](#features), [Pricing](#pricing), [About](#about),
  [Contact](#contact), [404 page](#404-page) (built in step 2b).

### Category tiles

- **SCREENSHOTS:** home-1.png, home-mobile.png.
- **LAYOUT ZONES:** one row of 8 equal tiles on desktop; 2 columns of 4 rows on a phone.
- **COMPONENT TYPES:** bordered rounded tile, a link: a small tinted round icon tile at the
  top left, the name at the bottom left, the count at the bottom right.
- **DATA FIELDS:** icon; name; item count.
- **USED BY:** [Template Library](#template-library) "Browse by Category" (decided, 4
  columns); [Categories](#categories) "Popular Categories" (built in step 2b).

### Section row over a card grid

- **SCREENSHOTS:** home-2.png and home-3.png (teardowns, patterns, guides), prompts-1.png and
  prompts-2.png ("Start with an outcome"), prompts-3.png ("New and noteworthy", 4 columns).
- **LAYOUT ZONES:** a section header row: title on the left, "View all →" on the right.
  Below, a 3-column grid of cards.
- **COMPONENT TYPES:** card = a muted top area (rounded, roughly 190–250px tall) holding a
  preview image or a centered icon tile, then text with no border around it. prompts-1.png
  and prompts-2.png add a corner count badge (a pill at the top right, "7 Prompts") and an
  optional status badge at the top left ("Hot").
- **DATA FIELDS:** per card: preview or icon; count badge; optional meta line (product icon
  and name, home-2.png); title (1–2 lines); muted description (2 lines) or muted meta
  ("Updated Sep 1", "12 min read · Jul 14").
- **USED BY:** [Home](#home) workflow steps and "Starter library", [Template
  Library](#template-library) cards (decided); [My Templates](#my-templates) (built in step
  2a); [Features](#features), [About](#about), [Public Profile](#public-profile) (built in
  step 2b).

### Bordered list cards

- **SCREENSHOTS:** home-3.png and home-4.png ("Popular prompts", "Popular skills"),
  prompts-2.png and prompts-3.png ("By role").
- **LAYOUT ZONES:**
  - home-3.png, home-4.png: two groups side by side. Each has a header (title, muted
    subtitle, "View all →" on the right) over a 2-column grid of short cards.
  - prompts-2.png, prompts-3.png: a 3-column grid of bordered panels. Each panel has a header
    row (title, "View all →", a divider) over 5 list rows.
- **COMPONENT TYPES:** bordered rounded card (home) or list row inside a panel (prompts); a
  small tinted round icon tile or an avatar; title; optional sub line; a trailing chevron on
  panel rows.
- **DATA FIELDS:** icon; title (1–2 lines); optional sub line (a star rating and count).
- **USED BY:** [Home](#home) product surfaces (decided); [Archive](#archive), [Shared
  run](#shared-run) sections (built in step 2a); [Categories](#categories) "All Categories",
  [Contact](#contact) (built in step 2b).

### Filterable grid

- **SCREENSHOTS:** prompts-4.png.
- **LAYOUT ZONES:** a header row: title on the left ("Explore all 210+ prompts"), a search
  input on the right. A chip row: "All" (selected, filled) and category chips. A 3-column
  grid of bordered cards.
- **COMPONENT TYPES:** search input; chips (single select); bordered card: a small colored
  category label with a trailing arrow icon, a title, a muted description clamped to 2 lines.
- **DATA FIELDS:** title; search placeholder; chip labels and the selected chip; per card:
  category, title, description.
- **USED BY:** [Template Library](#template-library) (decided, with search and chips in the
  hero); [My Templates](#my-templates) (built in step 2a); [Category page](#category-page)
  (built in step 2b).

### List rows with thumbnail

- **SCREENSHOTS:** teardowns-3.png, teardowns-4.png, patterns-3.png, home-4.png to home-7.png
  ("Recently published").
- **LAYOUT ZONES:** a group heading ("International products", "More in Trust"), then rows
  separated by dividers.
- **COMPONENT TYPES:** row = a rounded thumbnail on the left (about 176×110 in teardowns,
  320×200 in patterns), a text column, a trailing chevron.
- **DATA FIELDS:** thumbnail; meta line (product icon and name, a category, or "Skill · Sep
  17"); title; muted meta ("12 screens · June 16, 2026") or a 2-line description.
- **USED BY:** [My Runs](#my-runs) rows (built in step 2a), [Category page](#category-page)
  list view (built in step 2b).

### Detail page

- **SCREENSHOTS:** pattern-detail-1.png to pattern-detail-4.png, teardown-detail-1.png to
  teardown-detail-4.png.
- **LAYOUT ZONES:**
  - Breadcrumb row: home icon › section › item (chevron separators, muted).
  - Pattern layout (pattern-detail-1.png): a two-column header. Left: a large tinted icon
    tile, a big title, a muted description, "Updated <date>", a row of outline pill buttons
    ("Share", "LinkedIn", "Post on X"). Right: a large rounded panel with its own header
    ("Interactive demo", "Reset") and content.
  - Then a divider and a two-column body (pattern-detail-2.png to pattern-detail-4.png): the
    [left category nav](#left-category-nav) as a section nav, and content sections: a callout
    panel (small label, bold question), two columns "Use this pattern" and "Avoid this
    pattern" with bullets, numbered rows (01–06: title and description), definition rows
    (label on the left; title and description on the right).
  - Teardown layout (teardown-detail-1.png to teardown-detail-4.png): one centered column: a
    logo, a big title, "Updated <date>", a bordered facts strip of 5 cells (small uppercase
    label over a value), an intro paragraph, the share buttons. Then sections: a heading, a
    media panel wider than the text column with a caption, "What works" and "What we would
    push on" (icon, heading, bullets), "Takeaway", a callout bar ("Pattern: <link>").
- **COMPONENT TYPES:** breadcrumb; icon tile; heading; muted paragraph; date meta; outline
  pill button; side panel; facts strip; callout; bullet list; numbered row; definition row.
- **DATA FIELDS:** breadcrumb items; icon; title; description; updated date; share targets;
  panel title and content; section titles; facts (label, value).
- **USED BY:** [Public template page](#public-template-page) (decided); [Template
  detail](#template-detail), [Shared run](#shared-run) (built in step 2a); [Feature
  page](#feature-page), [Category page](#category-page) header, [Public
  Profile](#public-profile) header (built in step 2b).

### Left category nav

- **SCREENSHOTS:** patterns-2.png, patterns-3.png, patterns-4.png, teardowns-2.png,
  teardowns-3.png, teardowns-4.png.
- **LAYOUT ZONES:** a narrow left column (about 170–230px) that stays in view while the right
  column scrolls. Right: one block per category: a tinted icon tile, a big heading, a muted
  subtitle, an outline pill "View all <category> →" aligned right; "Start here" with 2-column
  cards; "More in <category>" list rows; a closing outline pill "View all 15+ <category>
  patterns →". teardowns-2.png adds "Filter by product" above: a 6-column grid of bordered
  filter tiles (icon and name; the selected one filled).
- **COMPONENT TYPES:** vertical link list (active item bold, hairline dividers); icon tile;
  heading; outline pill button; card; list row; filter tile.
- **DATA FIELDS:** category names (nav); per block: icon, title, subtitle, items.
- **USED BY:** [Template editor](#template-editor) outline, [Run page](#run-page) task list
  (built in step 2a); [Account Settings](#account-settings) section nav (proposed, not
  built: an open question).

### FAQ accordion

- **SCREENSHOTS:** home-8.png, home-9.png.
- **LAYOUT ZONES:** a section heading ("Frequently asked questions") over one bordered rounded
  container of 7 rows separated by dividers.
- **COMPONENT TYPES:** accordion row: the question on the left, a "+" icon on the right
  (collapsed in the shots).
- **DATA FIELDS:** question; answer.
- **USED BY:** none today: the app has no FAQ content.

### Multi-column footer

- **SCREENSHOTS:** home-8.png, home-9.png.
- **LAYOUT ZONES:** a full-width band in a contrasting tone. Row 1: brand (mark and name) and
  a blurb with an "About us" link on the left; two icon links on the right ("Subscribe to
  newsletter", "Follow on LinkedIn"). Row 2: 5 link columns. Row 3: copyright on the left, a
  "Dark mode" toggle pill on the right.
- **COMPONENT TYPES:** brand link; paragraph; column heading (small, muted); link list, some
  links with a muted description line; icon link; toggle pill.
- **DATA FIELDS:** brand name; blurb; column titles; link label, optional description, href.
- **USED BY:** [Public shell](#public-shell) footer (decided: brand, blurb and the existing
  columns only).

### Call-to-action banner

- **SCREENSHOTS:** home-7.png ("Weekly AI UX in your inbox").
- **LAYOUT ZONES:** a full-width rounded banner in a contrasting tone: an icon tile, a title
  and a description on the left; a pill button on the right.
- **COMPONENT TYPES:** banner card; icon tile; heading; muted paragraph; pill button.
- **DATA FIELDS:** icon; title; description; button label.
- **USED BY:** [Home](#home) closing card (decided: a bordered banner card with two buttons);
  [Shared run](#shared-run) closing card (built in step 2a); [Categories](#categories) closing
  card (built in step 2b).

### Other reference patterns

- **Featured carousel** (home-1.png, home-2.png, patterns-1.png, teardowns-1.png): a header
  row with a title, dot pagination and previous and next round buttons; a large card with a
  text column (eyebrow, title, description, footer link) beside a preview panel. Not used.
- **Right rail panels** (home-4.png to home-7.png): "Tools we love" and "Weekly newsletter"
  beside a list. Not used.

### Not copied

Left out because the app has no such feature, content or copy (the brief: rearrange the
existing content, invent nothing):

- The header's search button and "Newsletter" button. Its dropdown menus are copied since
  2026-09-29: "Templates" (the Template Library and Categories) and "Features" (the four
  feature pages).
- The floating "Feedback" widget, social links ("Subscribe to newsletter", "Follow on
  LinkedIn"), the copyright line and the footer's dark band.
- Preview images: card media show the item's icon in a muted area instead.
- The featured carousel, the right rail, the FAQ accordion and the "Recently published" list.
- Category tiles on Home (they need the public catalog, which Home must not load).
- On detail pages: the LinkedIn and X share buttons, and the section nav (the public template
  page's old section nav was removed on purpose,
  `tests/unit/components/PublicTemplateView.test.tsx`). The "Updated <date>" line is copied
  on the public template page since 2026-09-29. A Public Profile has no breadcrumb: it has no
  section to trail back to.
- The reference's tinted icon tiles: icon tiles use the neutral muted token (no custom
  colors).

## Shared shells and frames

### Public shell

- **SCREEN NAME:** Public shell (site header and site footer)
- **PURPOSE:** Frame every public page: brand, main navigation, sign-in actions, footer
  links.
- **HOW USER GETS HERE:** any page in the `(site)` route group, and the 404 page (on a missing
  console path too, for anyone not signed in).
- **WHAT'S ON THE SCREEN:**
  - Sticky header: brand link (the grid mark on the primary color and "SERP Lists") on the
    left; in the middle the "Site" NavigationMenu: "Templates" and "Features" open dropdowns
    (each link with its page's description: "Template Library" and "Categories"; "Template
    Builder", "Checklist Runs", "Public Sharing" and "Import + Export" in 2 columns), and
    "Pricing" is a link. The current page's link is highlighted and marked as the current
    page, and so is the menu that holds it (Features also on `/features/`). On the right a
    theme toggle (outline
    icon button named "Switch to dark mode" or "Switch to light mode"), then "Log in" (ghost)
    and "Get started" (primary) signed out, or the [account menu](#account-menu) (avatar with
    the user's initial) signed in.
  - Below `md`: the navigation, "Log in" and the theme toggle hide; "Get started" or the
    avatar stays; a menu button ("Open menu") before the brand opens the [public menu
    sheet](#public-menu-sheet).
  - The page, inside the route error boundary.
  - Footer: brand link and "Build repeatable checklists, publish them cleanly, and run them
    like operations."; columns "Templates" ("Template Library", "Categories", "Profiles"),
    "Company" ("About") and "Support" ("Contact").
- **PRIMARY ACTION:** "Get started" → [Register](#register) (signed out).
- **SECONDARY ACTIONS:** the header's menus and links; "Log in"; theme toggle; account menu;
  footer links.
- **STATES:**
  - Signed out, or signed in (the account menu replaces "Log in" and "Get started").
  - A page that crashes: a "Something went wrong" card ("This page could not be shown. Try
    again, or go to another page.", "Try again", "Go back", "Go to home") in its place; the
    header and footer keep working.
- **NAVIGATION TYPE:** shell; its links are root sections.
- **PATTERN CHOICE (decided):** [Site header](#site-header) and [Multi-column
  footer](#multi-column-footer).
  - Header: brand link on the left; a centered shadcn NavigationMenu: "Templates" and
    "Features" as dropdowns of their pages (the user's decision of 2026-09-29), "Pricing" as
    a link; on the right the theme toggle icon button, then "Log in" (ghost) and "Get started"
    (primary) signed out, or the account menu (avatar dropdown) signed in. Below `md` a menu
    button opens the same menus as labelled groups, the theme switch and the account actions
    in a Sheet.
  - Footer: brand and the existing blurb, then the columns "Templates" (the header's
    Templates menu: Template Library and Categories), "Company" (About) and "Support"
    (Contact).
  - Not copied: the search button, the Newsletter button, the feedback widget, social links,
    the copyright line.
- **REFERENCE IMAGES:** home-1.png, home-2.png, home-mobile.png (header); home-8.png,
  home-9.png (footer).
- **STRUCTURE (built):**
  - LAYOUT ZONES: top: sticky header (full width, content in the page container, hairline
    bottom border). Header zones: brand left; navigation menu center (2 dropdowns and a link);
    actions right.
    Phone: menu button, brand, primary button or avatar. Middle: the page. Bottom: footer
    band: brand column (brand link, blurb), link columns (heading, links).
  - COMPONENT TYPES: navigation menu trigger (a dropdown with titled links and their
    descriptions; active state); navigation menu link (active state); icon button; ghost
    button; primary button; avatar dropdown trigger; sheet; footer column.
  - DATA FIELDS: brand name; navigation item (label, href or menu links, active); menu link
    (label, description, href, active); user initial; blurb; footer column title; footer link
    (label, href).
- **PROOF PASS:** Pass (step 1). Checked on the header and footer of every step 1
  screenshot, and on public-menu-mobile-light-signed-out.png, against home-1.png,
  home-2.png, home-mobile.png, home-8.png and home-9.png. Zones, order and component types
  match: brand left, centered navigation, an icon button and a primary button right; on
  phones the menu button, the brand and the primary button; a footer with a brand column and
  link columns. The first pass had the phone menu button after the actions; it moved before
  the brand. Left out on purpose ([Not copied](#not-copied)): the search and Newsletter
  buttons, social links, the copyright row. The navigation dropdowns the reference has were
  added on 2026-09-29 and checked against home-1.png on
  `tmp/design-review/decisions/header-templates-menu-desktop-signed-out.png`,
  `header-features-menu-desktop-signed-out.png` (and the signed-in pair) and
  `phone-menu-sheet-mobile-signed-out.png`: a trigger with a chevron opens a panel of links
  under the header, as there.
- **NOTES:**
  - Code: `src/components/Layout.tsx` picks the shell. The header is
    `src/components/layout/SiteHeader.tsx`, the phone sheet
    `src/components/layout/PublicMobileNav.tsx` and the footer
    `src/components/layout/SiteFooter.tsx`. The header's navigation is
    `src/components/layout/SiteNavigationMenu.tsx`, and its menus and links come from one
    list (`publicHeaderItems` in `src/components/layout/publicSiteLinks.ts`), so a new link
    reaches the phone menu and the console's top bar too. Closed menus stay in the HTML,
    hidden, so crawlers find every page they link.
  - The open menu's links are read inside the header's "Site" navigation (its trigger claims
    them). Base UI renders the popup that holds them as a `<nav>`, which was left an empty,
    unlabelled navigation landmark at the end of the page while a menu was open, so
    `SiteNavigationMenu` composes the menu's root itself and renders the popup as a `div`
    (`tests/e2e/site-navigation.spec.ts`).
  - The footer's "Network" column is left out until someone confirms the address of its "SERP DR"
    link, which pointed at `https://serp.dr`, under a top-level domain that does not exist. It comes
    back as an external https link, with its domain added to the allowlist in
    `tests/unit/components/publicSiteLinks.test.ts`.
  - The footer's column titles are h2s since step 2b, so a page whose last heading is its h1
    (My Runs, a sign-in page on a phone) never skips a level into them.

### Signed-in console shell

- **SCREEN NAME:** Signed-in console shell
- **PURPOSE:** Frame every console page: move between console sections, see and switch the
  Ownership Context, reach the account.
- **HOW USER GETS HERE:** any page under `/dashboard/`, after the session check (an
  Organization's pages under `/dashboard/organization/<organizationId>/` included); the 404
  page for a signed-in user on a missing path under `/dashboard/`.
- **WHAT'S ON THE SCREEN:**
  - Left: the sidebar (full height). Header: the brand link and the [context
    switcher](#context-switcher) ("Switch context"). Content, in the "Dashboard" navigation
    landmark: "New Template" (primary; only for roles that can edit Templates); "Templates",
    "Runs", "Template Library", "Categories"; at the bottom "Import Templates", "Archive",
    "Settings". Footer: the theme toggle with its label ("Light mode" or "Dark mode") and the
    [account menu](#account-menu) row (initial, name or "Account settings", "@username" or
    email). The current section is highlighted and marked as the current page. It collapses
    to an icon rail (the trigger, Ctrl or Cmd+B, or its rail), with tooltips for the labels.
  - Right: a sticky top bar with the sidebar trigger ("Toggle Sidebar") and, from `md` up,
    the public header's navigation (the "Templates" and "Features" menus, "Pricing"),
    aligned right; the page; the site footer.
  - Below `md`: the sidebar opens as a sheet from the top bar's trigger.
- **PRIMARY ACTION:** "New Template" → [Template editor](#template-editor).
- **SECONDARY ACTIONS:** sidebar links; context switcher; account menu; theme toggle; the site
  links.
- **STATES:**
  - Session check: a spinner. A failed check: "Can't reach SERP Lists", "We couldn't check
    your session. Check your connection and try again.", "Retry".
  - Signed out: redirect to `/login/?next=<path>`.
  - Organizations failed to load before the Organization the URL names, or on `/dashboard/` the
    remembered one, was confirmed: "Couldn't load your Organizations", "Your Organization opens
    once they load. Check your connection and try again, or continue in Personal.", "Retry",
    "Continue in Personal" (in place of the page; on an Organization URL, Continue in Personal
    opens the same section in Personal, and on `/dashboard/` Personal's My Templates). A
    Personal URL never waits for the Organizations.
  - On an Organization URL: a spinner in place of the page until the Organizations load, and
    the [404 page](#404-page) for an Organization the user cannot open (unknown, archived or
    not theirs), with the switcher and the sidebar in the tab's own context.
  - Role-limited: no "New Template" for runners and viewers.
  - A page that crashes: "Something went wrong" with "Go to My Templates".
- **NAVIGATION TYPE:** shell; sidebar items are root sections.
- **PATTERN CHOICE (decided):** a shadcn Sidebar block, collapsible to icons.
  - Header: brand link and the context switcher ("Switch context").
  - Content: "New Template" (when the role can edit Templates), "Templates", "Runs", "Template
    Library", "Import Templates", "Archive", "Settings", and the "Categories" link the phone
    menu had.
  - Footer: the theme toggle and the account menu ("My Templates", "My Runs", "Settings",
    "Profile", "Sign out").
  - A top bar in the inset holds the sidebar trigger, and from `md` up the public header's
    navigation (`SiteNavigationMenu`, with its "Templates" and "Features" menus). On phones the
    sidebar opens as its own sheet and the bottom bar goes away. The site footer stays under
    console pages.
  - The reference has no console, so the sidebar follows shadcn's block, not a screenshot.
- **REFERENCE IMAGES:** none for the console. The sidebar list echoes the left nav in
  patterns-2.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: left: sidebar (header; scrolling content; footer). It collapses to an icon
    rail, and opens as a sheet on phones. Right (inset): a top bar with the sidebar trigger;
    the page; the site footer.
  - COMPONENT TYPES: sidebar menu button (icon, label, active state, tooltip when collapsed);
    primary button; dropdown triggers (context switcher, account menu); sidebar trigger icon
    button; sheet.
  - DATA FIELDS: active context (name, Personal or Organization, role); navigation item
    (label, icon, href, active); user (name, email, initial, username for "Profile").
- **PROOF PASS:** Pass (step 1), against shadcn's sidebar block (no reference screenshot):
  console-desktop-light-signed-in.png, console-desktop-dark-signed-in.png,
  console-mobile-light-signed-in.png, console-mobile-dark-signed-in.png,
  console-menu-mobile-light-signed-in.png, console-menu-mobile-dark-signed-in.png,
  account-menu-desktop-light-signed-in.png, account-menu-desktop-dark-signed-in.png. Sidebar
  header, content and footer, the rail, the inset's top bar, and the phone sheet are all
  present.
- **NOTES:**
  - Code: `src/components/layout/AppShell.tsx` and `src/components/layout/AppSidebar.tsx`.
  - A Run's page (`/dashboard/runs/<id>/`) highlights "Runs", in either context.
  - The sidebar's console links (and "New Template") open the current context's pages: on an
    Organization URL they stay under `/dashboard/organization/<organizationId>/`.
  - The public site header no longer sits above console pages: the sidebar holds the brand,
    the switcher, the theme toggle and the account menu, and the top bar the site navigation.
  - The collapsed state lasts until a full page load: reading shadcn's cookie on the server
    would render every console page per request.
  - The rows are 44px tall, the old sidebar's full-size targets
    (`tests/e2e/template-screens-layout.spec.ts`), where shadcn's are 32px; collapsed to icons
    they are shadcn's 32px squares.

### Auth card frame

- **SCREEN NAME:** Auth card frame
- **PURPOSE:** The shared frame of [Log in](#log-in), [Register](#register), [Forgot
  password](#forgot-password) and [Reset password](#reset-password), and, without its aside,
  of the [Organization invite](#organization-invite).
- **HOW USER GETS HERE:** through those pages.
- **WHAT'S ON THE SCREEN:** one card centered in the window. Its first column: an icon tile,
  the "SERP Lists" eyebrow, the page's title (its h1), a description, the form, and a footer
  line with a link. Beside it from `lg` up, a muted column: "Built for repeatable work",
  "Create the template once. Run it cleanly every time.", a paragraph, and 3 check-marked
  points.
- **PRIMARY ACTION:** the form's submit button.
- **SECONDARY ACTIONS:** the footer link.
- **STATES:** set by each page.
- **NAVIGATION TYPE:** frame for child pages.
- **PATTERN CHOICE (built):** shadcn's login block in its two-column form: one Card with the
  form in a column and a muted column beside it, which holds the existing aside where the
  block shows an image (`AuthCard`; `AuthPageShell` for the four sign-in pages). The aside
  stays, hidden below `lg` as before (an open question).
- **REFERENCE IMAGES:** none (the reference has no auth pages); type scale from home-1.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: one card centered in the window under the site header; from `lg` two
    columns, the form column (header, content, footer line) and the muted aside; one column
    below `lg`.
  - COMPONENT TYPES: icon tile; eyebrow; heading; muted paragraph; shadcn Field groups
    (labels, inputs, InputGroups with a leading icon or a show and hide button); full-width
    buttons; Alert; a footer line with a link; a check-marked list.
  - DATA FIELDS: title; description; footer text and link; aside title, text and points.
- **PROOF PASS:** Pass (step 2b), against shadcn's login block (the reference has no auth
  pages), on every sign-in and invite screenshot below: one card centered in the window, the
  header centered over the form, the footer line under it, and the aside beside it from
  `lg`; on a phone (390px) one column with no sideways scroll.
- **NOTES:** Code: `src/components/auth/AuthCard.tsx` and
  `src/components/auth/AuthPageShell.tsx`; the password fields are
  `src/components/auth/PasswordInput.tsx`.

## Screens

### Home

- **SCREEN NAME:** Home (`/`)
- **PURPOSE:** Explain the product (a Template, its Runs, a shareable record) and send
  visitors to sign up or to the library.
- **HOW USER GETS HERE:** the brand link; the address `/`; "Return to home" on the 404 page;
  "Go to home" after a crash; after "Sign out".
- **WHAT'S ON THE SCREEN:**
  - Hero: eyebrow "Operations checklists that actually run"; title "Build the checklist once.
    Run it every time."; description "SERP Lists turns repeatable work into a reusable
    template, a focused execution run, and a shareable record. It is for teams that need the
    same process done cleanly more than once."; "Get Started" (signed out) or "Open
    Dashboard" (signed in); "Browse the Template Library" (outline).
  - Workflow steps, 3 media cards: the step's icon in a muted area with the step number
    (1 to 3) as a corner badge, then a title ("Make a template", "Run the workflow", "Share
    the result") and a description.
  - Product surfaces, 3 bordered list cards: an icon tile, a title ("Template Library",
    "Live run tracking", "Shareable proof") and a description.
  - Starter library: eyebrow "Starter library", heading "Start with a real checklist, then
    make it yours.", link "View all templates"; 3 cards of the bundled starter Templates
    (title, description or "No description yet.", "N items in M sections", up to 3 category
    chips), each a link to its template page.
  - Closing card: "Stop rebuilding the same checklist in docs and spreadsheets.", "SERP Lists
    gives your repeatable work a home: one source template, many tracked runs, and clean share
    links when someone needs proof.", "Get Started" or "Open Dashboard", "Explore Features"
    (outline).
- **PRIMARY ACTION:** "Get Started" → [Register](#register); signed in, "Open Dashboard" →
  [My Templates](#my-templates).
- **SECONDARY ACTIONS:** "Browse the Template Library" and "View all templates" → [Template
  Library](#template-library); a starter card → [Public template page](#public-template-page);
  "Explore Features" → [Features](#features).
- **STATES:**
  - Signed out or signed in (the primary button's label and target).
  - "Loading templates..." in place of the starter cards, only while a Template list request
    started by another page is in flight. Home itself requests nothing.
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (decided):** [Page hero](#page-hero); [Section row over a card
  grid](#section-row-over-a-card-grid) for the workflow steps and the starter library;
  [Bordered list cards](#bordered-list-cards) for the product surfaces; [Call-to-action
  banner](#call-to-action-banner) for the closing card. No category tiles: counting categories
  needs the public catalog, which Home must not load (an ESLint convention lets only the
  pages that show the catalog load it, [D1 cost](d1-cost.md)).
- **REFERENCE IMAGES:** home-1.png (hero); prompts-1.png (cards with a corner badge);
  home-2.png, home-3.png (section rows); home-3.png, home-4.png, prompts-2.png (bordered list
  cards); home-7.png (banner); home-mobile.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES:
    - Hero, centered: eyebrow, title, description, a row of two buttons.
    - Workflow steps: a 3-column card grid.
    - Product surfaces: 3 bordered list cards.
    - Starter library: a section row (eyebrow and heading on the left, "View all templates"
      on the right) over a 3-column grid of template cards.
    - Closing banner.
  - COMPONENT TYPES:
    - Step card: a muted top area with the step icon in a centered icon tile and the step
      number as a corner badge; title; muted description.
    - Surface card: bordered card with an icon tile, title and muted description.
    - Template card: the shared block the [Template Library](#template-library) uses.
    - Banner: a bordered card with a title, a description, a primary and an outline button.
  - DATA FIELDS: hero (eyebrow, title, description, button labels); step (number, icon,
    title, description); surface (icon, title, description); template card (as in the
    library); banner (title, description, button labels).
- **PROOF PASS:** Pass (step 1): home-desktop-light-signed-out.png,
  home-desktop-dark-signed-out.png, home-mobile-light-signed-out.png,
  home-mobile-dark-signed-out.png and the four signed-in shots, against home-1.png to
  home-9.png, prompts-1.png and home-mobile.png. Present in the reference's order and types:
  centered hero; a 3-column grid of cards with a muted icon area, corner badge, title and
  description; bordered list cards; a section row (title left, "View all templates" right)
  over a 3-column card grid; a closing banner. The first pass cut the list cards'
  descriptions to 2 lines; they now show in full. Left out on purpose ([Not
  copied](#not-copied)): the category tiles, the featured carousel, "Recently published"
  with its rail, the FAQ.
- **NOTES:**
  - Code: `src/views/Index.tsx`.
  - The starter cards are the first 3 bundled Templates, which need no request.
  - The starter card keeps its "N items in M sections" line; the library card keeps "N
    sections" and "N tasks".

### Template Library

- **SCREEN NAME:** Template Library (`/templates/`)
- **PURPOSE:** Browse, search and filter every Public Template, then open one.
- **HOW USER GETS HERE:** "Template Library" in the header's "Templates" menu, the phone menu
  sheet and the footer's "Templates" column; sidebar "Template Library"; "Browse the Template
  Library" on Home, Features, feature pages, My Runs' empty state, a missing or failed
  template page and a shared run; Home "View all templates"; after a guest completes a shared
  Run; the breadcrumb's "Template Library" on a template page.
- **WHAT'S ON THE SCREEN:**
  - Hero: title "Template Library", "Browse hundreds of ready-to-use checklists created by
    the community", the search, labelled "Search templates" ("Search templates..."), and the
    category chips: "All" and one per category (a category chip links to its category page).
  - A toolbar: the result count ("N templates", or "N templates in <category>") and the sort
    buttons "Popular", "Trending", "Recent" (the current one pressed).
  - Template cards, up to 3 columns: a muted media area with the Template's type icon (a
    "View Template" shortcut on hover), up to 2 category badges, the title (its link covers
    the card), the description (2 lines), "N sections", "N tasks", an optional "N views",
    the owner's initial and handle (a link to the Public Profile), and "Start" (a link to the
    template page).
  - "Browse by Category" (a named region): up to 8 tiles (an icon tile, the name, "N
    template" or "N templates"), each a link to its category page.
- **PRIMARY ACTION:** a template card → [Public template page](#public-template-page).
- **SECONDARY ACTIONS:** search; a category chip → [Category page](#category-page); "All";
  sort; the owner → [Public Profile](#public-profile); a category tile; "Reset filters".
- **STATES:**
  - Loading (the catalog is pending; also the server's HTML): a skeleton of the title, chips
    and 8 cards.
  - Results.
  - No results: "No templates found", "Try adjusting your search or filters", "Reset filters".
  - Catalog error: "Could not load templates", "Check your connection and try again.", "Try
    again". A failed load never reads as no results.
  - `/templates/?category=<slug>` with no other filter replaces itself with the category page.
  - The filters live in the URL (`?search=`, `?sort=`, `?category=`), so Back and Forward
    change them.
- **NAVIGATION TYPE:** root section; push to the template page.
- **PATTERN CHOICE (decided):** [Page hero](#page-hero) with the search input and the category
  chips; [Filterable grid](#filterable-grid) (a toolbar row, then the 3-column template cards,
  the empty state and the error state); [Category tiles](#category-tiles) for "Browse by
  Category"; a skeleton while loading.
- **REFERENCE IMAGES:** prompts-1.png (hero with search and chips); prompts-4.png (filterable
  grid); home-2.png, prompts-1.png (card top area); home-1.png (category tiles);
  home-mobile.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES:
    - Hero, centered: title, description, search input, category chip row ("All" and the
      categories; category chips link to `/categories/<slug>/`).
    - Toolbar row: the result count on the left; the sort (Popular, Trending, Recent) on the
      right.
    - Results: a 3-column grid of template cards, or the empty state, or the catalog error
      state.
    - "Browse by Category": a section heading over a 4-column grid of category tiles.
  - COMPONENT TYPES: search input with a leading icon; chip ("All" is a button, a category
    chip a link); segmented sort buttons; template card; empty state (icon, title, text,
    button); error state (icon, title, text, button); category tile; skeleton.
  - DATA FIELDS:
    - Template card: type icon (checklist or recipe); up to 2 categories; title (1 line);
      description (2 lines); section count; task count; optional view count; owner (initial,
      handle, Public Profile link); "Start" link; the Template's canonical URL.
    - Category tile: icon; name; template count.
    - Toolbar: result count; the selected category's name.
- **PROOF PASS:** Pass (step 1): library-desktop-light-signed-out.png,
  library-desktop-dark-signed-out.png, library-mobile-light-signed-out.png,
  library-mobile-dark-signed-out.png and the four signed-in shots, against prompts-1.png to
  prompts-4.png, home-1.png and home-mobile.png. Present: the centered hero with the search
  input and the chip rows; a toolbar; a 3-column grid of cards with a muted icon area, a
  category line, title and description; a section heading over the category tiles (icon,
  name, count), 4 columns on desktop and 2 on phones. The reference's grid of text-only
  cards (prompts-4.png) and its "By role" panels have no counterpart: the library has one
  list.
- **NOTES:**
  - Code: `src/views/ChecklistLibrary.tsx`; the card is
    `src/components/checklist-library/TemplateCard.tsx`, the chips and sort
    `src/components/checklist-library/SearchAndFilters.tsx`.
  - Only Public Templates with a public URL (their owner has a username) are listed.
  - Category icons exist for the built-in categories; others get a default icon.
  - The card keeps its hover "View Template" shortcut (hidden from the keyboard and
    assistive technology, as before).
  - Step 2b gave the search its visible label, "Search templates" (it had no name at all),
    and made the cards' titles, the empty state's and the failed catalog's h2s, as they
    follow the page's h1.

### Public template page

- **SCREEN NAME:** Public template page (`/profile/<handle>/<template>/`, under its Template
  Owner's handle: a User's, or an active Organization's)
- **PURPOSE:** Show one Public Template and let the visitor start a Run or save a copy.
- **HOW USER GETS HERE:** a template card (library, category page, Public Profile, Home); a
  shared link (this is the Template's only public URL); the "Share Template" dialog's link.
- **WHAT'S ON THE SCREEN:**
  - A breadcrumb: Home (an icon) › "Template Library" › the Template's title.
  - Signed in, when the Organizations failed to load: "Couldn't load your Organizations",
    "Start Run and Save wait until they load. Check your connection and try again, or continue
    in Personal.", "Retry", "Continue in Personal".
  - Signed in, while the browser holds a [guest run](#guest-run) of this Template (and the role
    can start runs): "Your run of this Template is saved in this browser only." and "Save to
    account" (`GuestRunSaveOffer`).
  - The header: an icon tile by template type, the title, the description, the Template
    Owner's avatar and name (a link to its Public Profile: an Organization Template's
    Organization, never its Creator), "Updated <date>" (the Template's last
    update in the viewer's date format, as template detail's "Last updated"; left out when
    unreadable), the category badges (links to category pages; plain for a category with no
    page), and "Share" (outline), "Save" (outline) and "Start Run" (primary).
  - Beside it (below it on phones), a panel: "Sections", "Tasks", "Type" (checklist or
    recipe).
  - "Required tools" (only when the Template has tools): one bordered row per tool, two
    columns from `sm`, with its name as a link that opens the tool's site in a new tab
    ("<name> (opens in a new tab)" to screen readers), the site's host under it, and a
    "Required" or "Optional" badge.
  - "What's included": one collapsible card per section (number, title, "N tasks",
    chevron). Open, it lists numbered tasks with their title, description and content
    blocks, read-only.
  - Tags ("#tag").
  - "Ready to use this template?": text that says what the viewer's role allows; "Copy to
    Library" (outline) and "Start Run" (primary).
- **PRIMARY ACTION:** "Start Run" → [Start a Run dialog](#start-a-run-dialog) → [Run
  page](#run-page). Signed out, the same dialog starts a run in the browser → [Guest
  run](#guest-run); while that run is in progress both "Start Run" buttons read "Continue Run"
  (a link to it).
- **SECONDARY ACTIONS:** "Share" (copies the page's address: "Link copied to clipboard");
  "Save" or "Copy to Library" (copies the Template into the active context, then opens the
  copy's [Template detail](#template-detail)); a category chip; the owner link; open or close a
  section.
- **STATES:**
  - Loading: "Loading template…".
  - Load error: "Unable to load template", the message, "Try again", "Browse the Template
    Library" (stays indexable).
  - Not found: "Template not found", "The template you are looking for does not exist or is no
    longer public.", "Browse the Template Library" (noindex).
  - Save labels: "Save" and "Copy to Library"; "Saving..." and "Copying..."; "Checking
    plan..." (footer button); Free in Personal: "Upgrade to save" and "Upgrade to copy
    template"; after a save: "Saved".
  - Start Run: disabled while the context loads or while a Run starts ("Starting…" in the
    dialog).
  - Organization role limits: runners and viewers get no Save, viewers no Start Run; the
    card's text names what the role cannot do.
  - The Organization error notice above.
- **NAVIGATION TYPE:** child page (push from the discovery pages).
- **PATTERN CHOICE (decided):** [Detail page](#detail-page).
  - Breadcrumb: Home › Template Library › the Template's title. The Template Library link
    replaces "Back" and goes to the same place.
  - Header: an icon tile by template type, the big title, the description, the category chips,
    the owner's avatar and name link, "Updated <date>", and the actions "Share" (outline),
    "Save" (outline) and "Start Run" (primary) with their existing labels and states. A panel
    on the right holds the Sections, Tasks and Type stats.
  - Below: "What's included" (the collapsible section previews), the tags, and the "Ready to
    use this template?" card with Save and Start Run.
- **REFERENCE IMAGES:** pattern-detail-1.png (breadcrumb, header, right panel);
  pattern-detail-2.png (body); teardown-detail-1.png (facts strip, share buttons).
- **STRUCTURE (built):**
  - LAYOUT ZONES:
    - Breadcrumb row.
    - The Organization error notice, when shown.
    - Header, two columns: left: icon tile, title, description, a meta row (owner, updated
      date, category chips), action row; right: stats panel.
    - Body: "Required tools" (when the Template has tools), "What's included" (section
      cards), a tags row, the call-to-action card.
  - COMPONENT TYPES: breadcrumb; icon tile; heading; muted paragraph; chip link; avatar with a
    name link; outline and primary buttons; stats panel (3 rows: icon, value, label);
    collapsible card (a header row with a number badge, title, count and chevron); task row
    (number, title, description, content blocks); tag list; call-to-action card (title, text,
    two buttons); alert.
  - DATA FIELDS: title; description; type; categories (name, category URL); owner (name,
    initial, Public Profile URL); last update (`updatedAt`, else `createdAt`); section count;
    task count; Required tools (name, link, required or optional); sections (title, task
    count; tasks with title, description, content blocks); tags; Save and Start Run labels;
    the role-aware call-to-action text.
- **PROOF PASS:** Pass (step 1): template-desktop-light-signed-out.png,
  template-desktop-dark-signed-out.png, template-mobile-light-signed-out.png,
  template-mobile-dark-signed-out.png and the four signed-in shots, against
  pattern-detail-1.png to pattern-detail-4.png and teardown-detail-1.png. Present in the
  reference's order: breadcrumb (home icon › section › item); a two-column header (icon
  tile, big title, description, meta, a row of outline buttons with the primary action;
  a panel on the right); a divider; the content. Left out on purpose ([Not
  copied](#not-copied)): the LinkedIn and X buttons, the section nav. The "Updated" date,
  added on 2026-09-29, sits in the meta row as in pattern-detail-1.png:
  `tmp/design-review/decisions/public-template-updated-desktop-signed-out.png` and
  `public-template-updated-mobile-signed-out.png`.
- **NOTES:**
  - Code: `src/views/PublicTemplate.tsx` (loading, error and not-found states, on the Empty
    block) and `src/components/template/PublicTemplateView.tsx` (the page, on
    `DetailPageLayout`).
  - The header actions no longer stick under the site header while the page scrolls; the
    same Save and Start Run close the page in the "Ready to use this template?" banner.
  - Save and Start Run act in the active Ownership Context; the public shell has no context
    switcher.
  - The server renders the title, description, canonical URL and robots tag. The page loads
    the Template again on every visit (bundled Templates excepted).
  - The view is keyed by the Template's id, so another Template starts with fresh view state:
    its sections as they first open, and Save not yet "Saved".
  - Its loading, load error and not-found states are `PublicTemplateRecordStates`
    (`src/components/template/PublicTemplateRecordStates.tsx`), which the Guest run shares.

### Guest run

- **SCREEN NAME:** Guest run (`/profile/<user>/<template>/run/`)
- **PURPOSE:** Let a visitor who is not signed in work through a Public Template in the browser:
  tick tasks and Sub-tasks, write notes and complete it, with nothing saved to the server.
- **HOW USER GETS HERE:** "Start Run" on the [Public template page](#public-template-page)
  while signed out, through the [Start a Run dialog](#start-a-run-dialog); "Continue Run" there;
  a plain link to the address (a code project, a SKILL.md file), which starts a run with the
  default name when the browser has none.
- **WHAT'S ON THE SCREEN:**
  - The public shell, then a breadcrumb: Home (an icon) › "Template Library" › the Template's
    title (a link to its page) › the run's title.
  - The run page's header, without Rename, Share or a back button: the title, "X of Y tasks
    finished", "This run is saved in this browser only." (signed out, followed by "Log in or
    sign up to save it to your account.", both links back to this page), a "Completed" or "In
    Progress" badge, from `xl` a progress bar with "N%"; actions (under the text on phones):
    "Save to account" (signed in, for a role that can start runs), "Complete run" when every
    task is done, "Delete run" (outline).
  - The Template's Required tools as a compact card, as on the Run page (when it has tools).
  - The rest is the [Run page](#run-page)'s workspace (`RunWorkspace`): below `xl` the progress
    block with "Tasks"; the task panel with its sticky footer; from `xl` the task column. There
    is no provenance, Activity or "Removed from Template".
- **PRIMARY ACTION:** "Mark Complete".
- **SECONDARY ACTIONS:** "Previous" and "Next"; pick a task; notes; "Complete run" and "Finish
  Run" → [Run complete dialog](#run-complete-dialog); "Delete run" → [Delete
  confirmations](#delete-confirmations) → the public template page; "Log in" and "sign up" →
  [Log in](#log-in) or [Register](#register), then back here; "Save to account" → [Run
  page](#run-page) ("Run saved to your account"), or Stripe Checkout at the Personal plan's
  active-run limit; the breadcrumb.
- **STATES:** loading the Template ("Loading template…"), then a spinner while the run opens
  or starts; the Template's load error and not-found states, as on its page; in progress;
  every task done; completed (frozen, and the visitor stays); unsaved notes ([browser
  confirm](#browser-confirm-prompts)); a run another tab deleted or replaced ("Run not found",
  then the template page); a signed-in user with no guest run in the browser goes to the
  template page; "Save to account" disabled while it saves or checkout opens, and while the
  context loads; always `noindex, follow`, with no canonical URL.
- **NAVIGATION TYPE:** child page of the public template page.
- **PATTERN CHOICE (built):** the [Run page](#run-page)'s header and two-column workspace inside
  the public shell, under the [Detail page](#detail-page) breadcrumb.
- **REFERENCE IMAGES:** pattern-detail-2.png, pattern-detail-3.png (as for the Run page).
- **STRUCTURE (built):**
  - LAYOUT ZONES: breadcrumb; page header; progress block (below `xl`); task panel with its
    sticky footer; task column (from `xl`, sticky).
  - COMPONENT TYPES: breadcrumb; heading; badges; outline and primary buttons; shadcn
    Progress; checkbox; content blocks; notes Field; task list; Sheet; AlertDialog; Dialog.
  - DATA FIELDS: the guest run from localStorage (title, status, progress, task counts,
    sections, tasks, Sub-tasks, notes); the Template (title, page path).
- **PROOF PASS:** Pending: the lead runs `pnpm run ui:snap` on this page at desktop and phone
  width before the PR.
- **NOTES:** Code: `src/views/GuestRun.tsx`, with `GuestRunHeader` and `RunWorkspace` in
  `src/components/run-execution/`, the model in `src/features/guest-runs/` and the page's
  metadata in `src/app/(site)/profile/[username]/[templateSlug]/run/page.tsx`. It can't be
  shared: every visitor of the address sees the run their own browser holds. An Organization
  Template's guest run at its Creator's old URL redirects (308) to the Organization's `…/run/`,
  as the Template page does.

### Categories

- **SCREEN NAME:** Categories ("Browse Categories", `/categories/`)
- **PURPOSE:** List the template categories with their counts.
- **HOW USER GETS HERE:** "Categories" in the header's "Templates" menu, the phone menu
  sheet and the footer's "Templates" column; "All Categories" in a category page's
  breadcrumb; the console sidebar's "Categories".
- **WHAT'S ON THE SCREEN:**
  - Hero: title "Browse Categories", "Explore templates organized by category to find exactly
    what you need.", and the search, labelled "Search categories" ("Search categories...").
  - "Popular Categories": 4 tiles (icon tile, name, "N templates"), each a link to its page.
  - "All Categories": rows in 2 columns (icon tile, name, description, a "N templates" badge,
    chevron), each a link.
  - Closing banner: "Can't find what you're looking for?", "Create your own template from
    scratch and share it with the community.", "Create Template" (→
    `/dashboard/templates/new/`).
- **PRIMARY ACTION:** a category → [Category page](#category-page).
- **SECONDARY ACTIONS:** search; "Clear search"; "Create Template".
- **STATES:** loading (4 tile and 6 row skeletons, "Loading categories…" for screen readers);
  catalog error ("Could not load templates", "Try again") in place of both lists; a search
  with no match: the shared empty state in place of "All Categories"' rows ('No categories
  match "<query>"', "Clear search", which brings back every category and the search field's
  focus).
- **NAVIGATION TYPE:** child page.
- **PATTERN CHOICE (built):** [Page hero](#page-hero) with the labelled search; [Category
  tiles](#category-tiles) for "Popular Categories" (the library's tiles); [Bordered list
  cards](#bordered-list-cards) with chevrons for "All Categories"; [Call-to-action
  banner](#call-to-action-banner) for the closing card.
- **REFERENCE IMAGES:** prompts-1.png, home-1.png, prompts-2.png, prompts-3.png, home-7.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: centered hero (title, description, labelled search); "Popular Categories"
    (a section header over a 4-column tile grid, 2 on phones); "All Categories" (a section
    header over a 2-column grid of list cards, 1 on phones); the closing banner.
  - COMPONENT TYPES: `PageHero`; a Field with `SearchField`; `SectionHeader`; `ListCard`
    (vertical tiles; rows with a badge and a chevron); shadcn Empty; `CatalogLoadError`;
    Skeleton; `CtaBanner`.
  - DATA FIELDS: category (icon, name, description, template count).
- **PROOF PASS:** Pass (step 2b): `categories`, `categories-empty-search`,
  `categories-loading` and `categories-error`, each `-desktop-light`, `-desktop-dark`,
  `-mobile-light` and `-mobile-dark`, and `categories-signed-in-*`, against prompts-1.png,
  home-1.png, prompts-2.png, prompts-3.png and home-7.png. Present in the reference's order
  and types: a centered hero with a wide search; a row of 4 category tiles (icon, name,
  count; 2 columns on phones); bordered list cards with a trailing chevron; a closing banner
  (text left, button right; stacked on phones). The reference's tiles are tinted and ours
  neutral (the user's choice of 2026-09-29); its list panels have header rows with "View
  all", where one section here lists every category.
- **NOTES:** Code: `src/views/Categories.tsx`. "Create Template" sends a signed-out visitor to
  Log in. Built-in categories have descriptions; others read "Community templates for this
  workflow area". "Search categories" named the search before step 2b (its `aria-label`); now
  it is the field's visible label.

### Category page

- **SCREEN NAME:** Category page (`/categories/<slug>/`)
- **PURPOSE:** List the Public Templates in one category.
- **HOW USER GETS HERE:** a library category chip or "Browse by Category" tile; a Categories
  tile or row; a category chip on a template page; "Related Categories";
  `/templates/?category=<slug>`.
- **WHAT'S ON THE SCREEN:**
  - Breadcrumb: Home › "All Categories" › the category.
  - Header: the category's icon tile, name and description, and a "N templates" badge.
  - Toolbar: "Search" ("Search templates..."), "Sort by" ("Most Popular", "Most Recent",
    "Trending", "Name A-Z"), the grid and list buttons ("Show templates in grid view", "Show
    templates in list view").
  - The library's template cards, 3 columns (in list view, one column of wide cards with the
    media beside the text from `sm`).
  - "Related Categories": up to 5 category chips.
- **PRIMARY ACTION:** a template card → [Public template page](#public-template-page).
- **SECONDARY ACTIONS:** search; sort; grid or list; a related category; "All Categories" and
  Home in the breadcrumb.
- **STATES:** loading (the count's and 6 cards' skeletons, "Loading templates…" for screen
  readers); a category only the catalog knows, while it loads (the breadcrumb and skeletons)
  or after it failed (the breadcrumb, then "Could not load templates" as the page's h1, with
  "Try again"); a category the bundled Templates know whose catalog failed ("Could not load
  templates" over those Templates); empty: "No public templates in this category yet."
  (noindex) or "No templates found matching your search."; an unknown category: the [404
  page](#404-page) view (noindex, HTTP 200); an old slug replaces itself with the current
  one; grid or list (remembered per user).
- **NAVIGATION TYPE:** child page; push to the template page.
- **PATTERN CHOICE (built):** a [Detail page](#detail-page) header (`DetailPageLayout`: the
  breadcrumb, icon tile, title, description, the count as a badge) over a [Filterable
  grid](#filterable-grid) (the `Toolbar` with the labelled search and sort and
  `ViewModeToggle`, then the library's template cards; list view as [List rows with
  thumbnail](#list-rows-with-thumbnail)); "Related Categories" as a section header over a
  chip row.
- **REFERENCE IMAGES:** pattern-detail-1.png, patterns-2.png, prompts-4.png, teardowns-3.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: breadcrumb; header (icon tile, title, description, count badge); a
    separator; toolbar (search, sort, view buttons; stacked on phones); the results (grid,
    list, empty or error); "Related Categories" (heading, chips).
  - COMPONENT TYPES: `PageBreadcrumb`; icon tile; badge; labelled `SearchField`; labelled
    Select; `ViewModeToggle`; `TemplateCard` (vertical or horizontal); shadcn Empty;
    `CatalogLoadError`; Skeleton; `SectionHeader`; chip links.
  - DATA FIELDS: category (name, icon, description, count); template card (as in the
    library).
- **PROOF PASS:** Pass (step 2b): `category` (outdoor), `category-list`, `category-sort` (the
  select open), `category-no-match`, `category-empty` (Business & Operations),
  `category-loading`, `category-error`, `category-catalog-only-loading`,
  `category-catalog-only-error` (SEO) and `category-unknown`, each on desktop and phone,
  light and dark, and `category-signed-in-*`, against pattern-detail-1.png, prompts-4.png and
  teardowns-3.png. Present: the breadcrumb row (home icon › section › item); a header with a
  large icon tile, big title, muted description and a meta line; a divider; a filter row
  over a 3-column grid of cards with a muted icon area, a category line, title and 2-line
  description; in list view, rows with the thumbnail on the left. The reference's filter
  chips are the sort select and the view buttons here (the page is one category already),
  and it has no related-categories row.
- **NOTES:** Code: `src/views/CategoryDetail.tsx` and
  `src/components/checklist-library/CategoryNavigation.tsx`. Each category opens with an
  empty search and the default sort. "Search" and "Sort by" are visible labels since step 2b
  (the search had no name, and the select was named by its value); "All Categories" moved
  from a back link into the breadcrumb, with the same words and destination.

### Public Profile

- **SCREEN NAME:** Public Profile (`/profile/<handle>/` for a User's handle)
- **PURPOSE:** Show a Profile Owner and their Public Templates.
- **HOW USER GETS HERE:** the owner link on a template card or template page; the account
  menu's "Profile" (a new tab); the "Public profile URL" link in Account Settings.
- **WHAT'S ON THE SCREEN:**
  - Header: the avatar; the name; "@username"; a summary; meta (location, website link,
    "Joined <month year>").
  - Beside it (under it on phones), a panel with 3 stats: "Templates"; "Total Views" or
    "Checklist Items"; "Total Runs" or "Categories".
  - "Public Templates" with "Browse every public template published from this profile.";
    template cards in the card grid (up to 3 category badges, the title, the description or
    "Public template pack published in this creator profile." ("…by this Organization." on an
    Organization's profile), then "@username", "N
    sections", "N items").
- **PRIMARY ACTION:** a template card → [Public template page](#public-template-page).
- **SECONDARY ACTIONS:** the website link (a new tab).
- **STATES:** loading ("Loading profile..."); error ("Unable to load profile", the message,
  "Try again"); not found ("Profile not found", "This profile does not exist.", noindex); no
  Templates ("No public templates", "@<user> has not published any public templates yet.");
  another letter case of the username replaces itself with the stored one.
- **NAVIGATION TYPE:** child page.
- **PATTERN CHOICE (built):** a [Detail page](#detail-page) header (`DetailPageLayout` with no
  breadcrumb: the avatar in the icon tile's place, the big title, the handle, the summary,
  the meta row) with the stats as its right panel, as on the template page; [Section row
  over a card grid](#section-row-over-a-card-grid) for "Public Templates", with `MediaCard`s;
  the template page's page states (`PageEmptyState`, `PageLoadingState`).
- **REFERENCE IMAGES:** pattern-detail-1.png, teardown-detail-1.png, home-2.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: header (avatar, name, handle, summary, meta) with the stats panel beside
    it; a separator; "Public Templates" (a section header over the card grid or the empty
    state).
  - COMPONENT TYPES: avatar; heading; muted lines; meta items with icons; external link;
    `Stat` panel; `SectionHeader`; `MediaCard` (its link covers the card) with badges; shadcn
    Empty; Spinner.
  - DATA FIELDS: profile (name, username, avatar, summary, location, website, joined date,
    stats); Template (title, description, type, categories, section count, item count, URL).
- **PROOF PASS:** Pass (step 2b): `profile` (serp), `profile-no-templates`,
  `profile-not-found`, `profile-loading` and `profile-error`, each on desktop and phone,
  light and dark, and `profile-signed-in-*`, against pattern-detail-1.png,
  teardown-detail-1.png and home-2.png. Present: a two-column header (a media tile, big
  title, muted lines, a meta row; a panel on the right); a divider; a section row (title,
  description) over a 3-column grid of cards with a muted icon area, a category line, title
  and 2-line description. The reference's breadcrumb is left out: a profile has no section
  to trail back to. The cards are `MediaCard`s like the library's rather than the library's
  card itself, which would change their words ("N tasks", "Start", the owner).
- **NOTES:** Code: `src/views/PublicProfile.tsx` (the states and the handle lookup) and
  `src/components/profile/PublicProfileDetails.tsx`, which an Organization's handle shares
  ([Organization Public Profile](#organization-public-profile)). The avatar image is
  decorative (`alt=""`) beside the name. Until step 2b the cards had no media area and a
  trailing arrow icon, in 2 columns.

### Organization Public Profile

- **SCREEN NAME:** Organization Public Profile (`/profile/<handle>/` for an active
  Organization's handle)
- **PURPOSE:** Show an Organization and its Public Templates.
- **HOW USER GETS HERE:** the owner link on an Organization Template's card (the Template
  Library, a category page) or public template page; a link to its handle.
- **WHAT'S ON THE SCREEN:**
  - Header: the Organization's avatar (or its initials); its name; "@handle"; its description,
    or without one the summary a User's profile shows ("Public checklist templates from
    @<handle> covering <categories>." or "Public checklist templates and repeatable workflow
    packs published by @<handle>.").
  - Beside it (under it on phones), the panel with 3 stats: "Templates", "Checklist Items",
    "Categories".
  - "Public Templates" with "Browse every public template published from this profile."; the
    Public Profile's template cards, each opening `/profile/<handle>/<template>/`.
- **PRIMARY ACTION:** a template card → [Public template page](#public-template-page).
- **SECONDARY ACTIONS:** none.
- **STATES:** loading ("Loading profile..."); error ("Unable to load profile", the message,
  "Try again"); not found ("Profile not found", "This profile does not exist.", noindex), also for
  an archived Organization, which keeps its handle; no Templates ("No public templates",
  "@<handle> has not published any public templates yet."); another letter case of the handle
  replaces itself with the stored one.
- **NAVIGATION TYPE:** child page.
- **PATTERN CHOICE (built):** the [Public Profile](#public-profile)'s: a [Detail
  page](#detail-page) header with the avatar and the stats panel, then a [Section row over a
  card grid](#section-row-over-a-card-grid). It has no meta row: an Organization has no
  location, website or join date to show.
- **REFERENCE IMAGES:** pattern-detail-1.png, teardown-detail-1.png, home-2.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: header (avatar, name, handle, description) with the stats panel beside it; a
    separator; "Public Templates" (a section header over the card grid or the empty state).
  - COMPONENT TYPES: as the Public Profile, without the meta items.
  - DATA FIELDS: Organization (name, handle, avatar, description, stats); Template (title,
    description, type, categories, section count, item count, URL).
- **PROOF PASS:** Not run yet: `pnpm run ui:snap` of an Organization's profile on desktop and
  phone, light and dark, against the references above, is the PR's evidence.
- **NOTES:** Code: `src/views/PublicProfile.tsx` and
  `src/components/profile/PublicProfileDetails.tsx`, shared with the Public Profile. The page
  loads nothing else about the Organization: no members, roles, invites, billing, Runs,
  activity or private Templates ([Organizations](organizations.md#public-profile)). Owners and
  admins set the avatar and description on the [Organization Settings](#organization-settings).

### Profiles

- **SCREEN NAME:** Profiles ("Profiles", `/profiles/`)
- **PURPOSE:** Find the people and Organizations that have a Public Profile.
- **HOW USER GETS HERE:** "Profiles" in the footer's "Templates" column; a link to a later page
  (`?collection=organizations`, `?after=` or `?before=` a handle).
- **WHAT'S ON THE SCREEN:**
  - Hero: title "Profiles" and "Browse the public profiles of people and Organizations, and
    the templates they publish."
  - Tabs, labelled "Profile collections": "People" (the default) and "Organizations", each
    with an icon.
  - The tab's cards, 24 a page in handle order: the avatar (or initials), the name (or
    "@handle" without one) as an `h2`, "@handle", and "N public templates"; each card is one
    link to `/profile/<handle>/`.
  - Under the cards, when there is another page: "Previous" and "Next", in a navigation
    landmark named "People pages" or "Organizations pages".
- **PRIMARY ACTION:** a card → [Public Profile](#public-profile) or
  [Organization Public Profile](#organization-public-profile).
- **SECONDARY ACTIONS:** switch tab (rewrites the address, no new history entry); "Previous" and
  "Next" (new history entries).
- **STATES:** loading ("Loading profiles..." before the address is read, then "Loading
  people..." or "Loading Organizations..."); load error ("Unable to load people." or "Unable to
  load Organizations.", "Retry"); a failed refresh over the last list ("Unable to refresh
  people." or "Unable to refresh Organizations.", "Retry"); empty ("No people yet", "People
  appear here once they choose a username for their public profile." or "No Organizations yet",
  "Organizations appear here once they have a public profile."); past the last page ("No more
  people" or "No more Organizations", "Go to the first page"). An address it cannot read
  shows the first page of People.
- **NAVIGATION TYPE:** root section (footer).
- **PATTERN CHOICE (built):** [Page hero](#page-hero) over shadcn Tabs, then a card grid of
  [Bordered list cards](#bordered-list-cards) with the avatar in place of the icon tile.
- **REFERENCE IMAGES:** prompts-1.png, home-1.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: centered hero (title, description); the tab list (full width on phones);
    the tab's card grid (1 column on phones, 2 from `sm`, 3 from `lg`); the pager, Previous on
    the left and Next on the right, wrapping on phones.
  - COMPONENT TYPES: `PageHero`; shadcn Tabs; `CardGrid`; `ProfileDirectoryCard` (shadcn Item
    as a link, Avatar); `QueryListState`; shadcn Empty; outline buttons as links.
  - DATA FIELDS: Profile Owner (handle, name, avatar, public Template count) and the page's
    cursors.
- **PROOF PASS:** Not run yet: `pnpm run ui:snap` of `/profiles/` and
  `/profiles/?collection=organizations` on desktop and phone (390px), light and dark, against
  the references above, is the PR's evidence.
- **NOTES:** Code: `src/views/ProfilesDirectory.tsx`, `src/components/profile/ProfileDirectoryCard.tsx`
  and `src/features/profile/useProfileDirectory.ts`; the API and its eligibility rule are in
  [SEO and sitemaps](seo-and-sitemaps.md#profiles-directory). Every address names `/profiles/`
  as its canonical URL.

### Features

- **SCREEN NAME:** Features (`/features/`)
- **PURPOSE:** Summarize what the product does.
- **HOW USER GETS HERE:** "Explore Features" on Home and About; "Features" in a feature
  page's breadcrumb. The header's "Features" menu lists the feature pages, not this
  overview, and shows as the current section here.
- **WHAT'S ON THE SCREEN:** hero: eyebrow "Features", title "Features that keep work
  consistent.", "Build checklists once, then run them repeatedly with confidence. SERP Lists
  focuses on clarity, repeatability, and simple sharing.", "See Pricing" (primary), "Browse the
  Template Library" (outline); 4 feature cards in 2 columns, each a link (the icon in a muted
  media area, title, description, "View the feature details and related workflows."):
  "Template Builder", "Checklist Runs", "Public Sharing", "Import + Export".
- **PRIMARY ACTION:** a feature card → [Feature page](#feature-page).
- **SECONDARY ACTIONS:** "See Pricing"; "Browse the Template Library".
- **STATES:** static.
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (built):** [Page hero](#page-hero); [Section row over a card
  grid](#section-row-over-a-card-grid) without its header row: `MediaCard`s (a muted top with
  the feature icon, then title and description).
- **REFERENCE IMAGES:** prompts-1.png, prompts-2.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: centered hero; a 2-column card grid (1 on phones).
  - COMPONENT TYPES: `PageHero` (eyebrow, heading, paragraph, buttons); `MediaCard` with
    `href` (media, title as an h2, description, a muted line).
  - DATA FIELDS: feature (slug, icon, title, description).
- **PROOF PASS:** Pass (step 2b): `features-desktop-light`, `-desktop-dark`, `-mobile-light`
  and `-mobile-dark`, and `features-signed-in-*`, against prompts-1.png and prompts-2.png.
  Present: the centered hero with its buttons; a grid of cards with a muted media area
  holding the icon, then the title and a muted description. 2 columns for 4 cards, where the
  reference's rows hold 3.
- **NOTES:** Code: `src/views/Features.tsx`; content in `src/data/publicFeatures.ts`.

### Feature page

- **SCREEN NAME:** Feature page (`/features/<slug>/`)
- **PURPOSE:** Describe one feature.
- **HOW USER GETS HERE:** the header's "Features" menu (and its group in the phone menu
  sheet); a card on Features. The slugs are `template-builder`, `checklist-runs`,
  `public-sharing` and `import-export`.
- **WHAT'S ON THE SCREEN:** breadcrumb: Home › "Features" › the feature; header: the icon
  tile, title, description, "Browse the Template Library" (primary), "See Pricing"
  (outline); beside it (under it on phones), a panel with the feature's 3 points,
  check-marked.
- **PRIMARY ACTION:** "Browse the Template Library" → [Template Library](#template-library).
- **SECONDARY ACTIONS:** "See Pricing"; "Features" and Home in the breadcrumb.
- **STATES:** an unknown slug shows the [404 page](#404-page) view (titled "Page not found",
  noindex, HTTP 200).
- **NAVIGATION TYPE:** child page.
- **PATTERN CHOICE (built):** [Detail page](#detail-page) (`DetailPageLayout`): the
  breadcrumb in place of "Back to Features" (the same destination), the icon tile, big title,
  description and actions, and the points in the panel beside the header.
- **REFERENCE IMAGES:** pattern-detail-1.png, teardown-detail-1.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: breadcrumb; a two-column header: the icon tile, title, description and
    buttons on the left, the points panel on the right (under them on phones).
  - COMPONENT TYPES: `PageBreadcrumb`; icon tile; heading; paragraph; primary and outline
    link buttons; a check-marked list in a muted panel.
  - DATA FIELDS: feature (icon, title, description, bullets).
- **PROOF PASS:** Pass (step 2b): `feature-template-builder`, `feature-checklist-runs`,
  `feature-public-sharing`, `feature-import-export` and `feature-unknown`, each on desktop
  and phone, light and dark, and `feature-template-builder-signed-in-*`, against
  pattern-detail-1.png. Present: the breadcrumb row; a two-column header (a large icon tile,
  big title, muted description, a row of buttons; a rounded panel on the right). A feature
  has no content under its header, so there is no divider or body, and the reference's
  share buttons are not copied.
- **NOTES:** Code: `src/views/Features.tsx` (one view for both routes). The breadcrumb's
  "Features" replaces "Back to Features" (an open question).

### Pricing

- **SCREEN NAME:** Pricing (`/pricing/`)
- **PURPOSE:** Compare Free and Pro, and start the Pro checkout.
- **HOW USER GETS HERE:** header "Pricing"; "See Pricing" on Features and feature pages.
- **WHAT'S ON THE SCREEN:** hero: eyebrow "Pricing", title "Simple pricing for checklist
  workflows.", "Start with the free plan and upgrade when you need advanced template
  management."; plan card "Free" ("Core checklist building and runs."; "Create templates with
  sections and items", "Run checklists and track progress", "Browse public checklists";
  "Start Free" outline → Register); plan card "Pro" ("$9/month. Cancel anytime."; "Import and
  export template backups", "Save public templates to your account", "Manage billing from
  account settings"; the Pro action); "Payments and subscription management are securely
  handled by Stripe."
- **PRIMARY ACTION:** the Pro action; for a Free User "Upgrade — $9/month" → Stripe Checkout.
- **SECONDARY ACTIONS:** "Start Free".
- **STATES (the Pro action):** signed out: "Get Started" (→ Register); "Checking plan..."
  (disabled); plan unknown: "Couldn't check your plan. Try again." with "Retry"; managed by
  support: "Your plan is managed by support. Contact support to change it."; paid: "Manage
  Pro" or "Manage subscription" (→ Account Settings); "Opening checkout..."; billing off:
  "Upgrade unavailable". A failed checkout shows a toast.
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (built):** [Page hero](#page-hero); 2 shadcn Cards side by side in the
  narrow width, like the bordered cards of [Filterable grid](#filterable-grid): the plan's
  name (an h2) and price line in the header, a check list, and the action in the card's
  footer.
- **REFERENCE IMAGES:** prompts-1.png, prompts-4.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: centered hero; a 2-column grid of plan Cards (stacked on phones); a
    footnote.
  - COMPONENT TYPES: Card (header with title and description, content with a check list,
    footer with the action); outline and primary buttons; Alert with Retry.
  - DATA FIELDS: plan (name, description, features, action label and state).
- **PROOF PASS:** Pass (step 2b): `pricing-signed-out`, `pricing-free` (billing is off on the
  local stack: "Upgrade unavailable"), `pricing-upgrade`, `pricing-opening-checkout`,
  `pricing-checkout-failed` (the toast), `pricing-checking`, `pricing-unknown`,
  `pricing-support` and `pricing-manage-pro` (a paid Pro plan, answered by the script: the
  seeded Pro users' plans are managed by support), each on desktop and phone, light and
  dark, against
  prompts-1.png and prompts-4.png. Present: the centered hero; bordered cards with a title, a
  muted line and their content. The reference's cards are text-only; a plan card adds its
  action in the card's footer.
- **NOTES:** Code: `src/views/Pricing.tsx`. A plan label never shows before the plan loads.

### About

- **SCREEN NAME:** About (`/about/`)
- **PURPOSE:** Say what SERP Lists is for.
- **HOW USER GETS HERE:** footer "About".
- **WHAT'S ON THE SCREEN:** hero: eyebrow "About", title "Build repeatable work that feels easy
  to discover and execute.", "SERP Lists helps teams and solo operators turn repeatable work
  into checklists that are easy to run, track, and share.", "Explore Features" (primary),
  "Contact Us" (outline); 3 value cards (the icon in a muted media area, title,
  description): "Clarity", "Consistency", "Community".
- **PRIMARY ACTION:** "Explore Features" → [Features](#features).
- **SECONDARY ACTIONS:** "Contact Us" → [Contact](#contact).
- **STATES:** static.
- **NAVIGATION TYPE:** root section (footer).
- **PATTERN CHOICE (built):** [Page hero](#page-hero); [Section row over a card
  grid](#section-row-over-a-card-grid) without the header row: 3 `MediaCard`s with the icon in
  their muted top.
- **REFERENCE IMAGES:** home-1.png, prompts-1.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: centered hero; a 3-column card grid (1 on phones, 2 from `sm`).
  - COMPONENT TYPES: `PageHero` (eyebrow, heading, paragraph, buttons); `MediaCard` (media,
    title as an h2, description).
  - DATA FIELDS: value (icon, title, description).
- **PROOF PASS:** Pass (step 2b): `about-desktop-light`, `-desktop-dark`, `-mobile-light` and
  `-mobile-dark`, and `about-signed-in-*`, against home-1.png and prompts-1.png. Present: the
  centered hero with two buttons; a 3-column grid of cards with a muted media area, a title
  and a muted description.
- **NOTES:** Code: `src/views/About.tsx`.

### Contact

- **SCREEN NAME:** Contact (`/contact/`)
- **PURPOSE:** Reach support or send product feedback.
- **HOW USER GETS HERE:** footer "Contact"; "Contact Us" on About.
- **WHAT'S ON THE SCREEN:** hero: eyebrow "Contact", title "Talk to the team behind SERP
  Lists.", "Questions, feedback, or support requests? Reach out and we will respond as soon as
  possible."; card "Email support" ("Send details about your issue, plus the account email if
  relevant.", a "support@serplists.com" email button); card "Product feedback" ("Tell us what
  would make SERP Lists more useful for your workflow.", "Share feedback" (outline, an email
  link with a subject)).
- **PRIMARY ACTION:** "support@serplists.com" (opens the mail app).
- **SECONDARY ACTIONS:** "Share feedback".
- **STATES:** static.
- **NAVIGATION TYPE:** root section (footer).
- **PATTERN CHOICE (built):** [Page hero](#page-hero); [Bordered list
  cards](#bordered-list-cards): `ListCard`s with the icon tile, the title (an h2), the
  description and the email link on the right.
- **REFERENCE IMAGES:** home-1.png, home-3.png, home-4.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: centered hero; two list cards, one under the other, in the narrow width.
  - COMPONENT TYPES: `ListCard` (icon tile, heading, description, a link button on the
    right; under the text on phones).
  - DATA FIELDS: channel (icon, title, description, button label, mailto link).
- **PROOF PASS:** Pass (step 2b): `contact-desktop-light`, `-desktop-dark`, `-mobile-light`
  and `-mobile-dark`, and `contact-signed-in-*`, against home-1.png, home-3.png and
  home-4.png. Present: the centered hero; bordered rounded cards with a small icon tile, a
  title and a sub line. The reference's cards sit two to a row; ours are full rows so each
  keeps its button beside the text.
- **NOTES:** Code: `src/views/Contact.tsx`.

### Log in

- **SCREEN NAME:** Log in ("Welcome back", `/login/`)
- **PURPOSE:** Sign in with email and password.
- **HOW USER GETS HERE:** header "Log in"; a console link while signed out
  (`?next=<path>`); "Sign in" on Register; "Back to sign in"; "Log in to accept" on an invite;
  "Sign in" in a session-ended notice; after Register when the email needs verifying; after
  "Update password".
- **WHAT'S ON THE SCREEN:** the [auth card frame](#auth-card-frame) with "Welcome back" and
  "Sign in to your account to continue"; outside production only, the persona buttons "Fill
  SERP", "Fill Admin", "Fill John", "Fill Jane", "Fill Bob" and a seed password note; a
  verification notice when needed ("Verify your email before signing in." or why the link
  failed); "Email" ("you@example.com"); "Password" with "Forgot password?" and a show or hide
  button ("Show password", "Hide password"); "Resend verification email" when needed; "Sign
  in"; footer "Don't have an account? Sign up".
- **PRIMARY ACTION:** "Sign in" → the `next` path, or `/dashboard/` when there is none, which
  opens the remembered context's [My Templates](#my-templates).
- **SECONDARY ACTIONS:** "Forgot password?"; "Sign up"; "Resend verification email"; show or
  hide the password.
- **STATES:** default; "Signing in..."; wrong credentials (toast "Invalid email or password",
  or the API's message); email not verified (toast "Email not verified. Check your inbox or
  resend verification.", the notice, the resend button); "Resending verification…"; a failed
  verification link (notice and toast); verified (toast "Email verified. You can sign in
  now."); `?verify_email=1` (toast "Verify your email first, then sign in."); the email
  prefilled after sign-up; signed in (toast "Login successful", then `next` or My Templates);
  already signed in (redirects to `next` or My Templates).
- **NAVIGATION TYPE:** child page (auth flow).
- **PATTERN CHOICE (built):** the [auth card frame](#auth-card-frame): a form of shadcn
  Fields, the email in an InputGroup with its mail icon, the password in `PasswordInput` with
  its lock icon, the notice as an Alert (a polite status, as before).
- **REFERENCE IMAGES:** none (the reference has no auth pages).
- **STRUCTURE (built):**
  - LAYOUT ZONES: the auth card frame; one form column.
  - COMPONENT TYPES: button grid in a dashed box (development only); Alert; labelled
    InputGroups with a leading icon; the password's show or hide button; full-width buttons;
    footer link.
  - DATA FIELDS: email; password; notice text; return path.
- **PROOF PASS:** Pass (step 2b), against shadcn's login block: `login`,
  `login-password-shown`, `login-error` (the toast), `login-verification-failed` and
  `login-success` (the toast over My Templates), each on desktop and phone, light and dark.
  Every field has its visible label, the form fits a 390px screen, and the development panel
  uses theme colors only.
- **NOTES:** Code: `src/views/Login.tsx`. One-shot query parameters (notices, the email) leave
  the address bar once read. The development persona buttons lost their colored dots.

### Register

- **SCREEN NAME:** Register ("Create your account", `/register/`)
- **PURPOSE:** Create an account.
- **HOW USER GETS HERE:** header "Get started"; "Get Started" on Home and Pricing; "Start
  Free"; "Sign up" on Log in; "Create an account" on an invite.
- **WHAT'S ON THE SCREEN:** the [auth card frame](#auth-card-frame) with "Create your
  account" and "Sign up with email and password"; "Name" ("Your name"); "Email"; "Password"
  ("Enter your password", show or hide); "Confirm Password" ("Confirm your password", show or
  hide); "Create account"; footer "Already have an account? Sign in".
- **PRIMARY ACTION:** "Create account" → Log in with the verification notice when the email
  must be verified; otherwise the return path or [My Templates](#my-templates).
- **SECONDARY ACTIONS:** "Sign in"; show or hide passwords.
- **STATES:** "Creating account..."; toasts "Passwords do not match" and the password rule;
  sign-up unavailable ("Account email verification is temporarily unavailable. Please contact
  support."); success ("Account created. Check your email to verify your address before
  signing in." or "Registration successful"); a failure toast.
- **NAVIGATION TYPE:** child page (auth flow).
- **PATTERN CHOICE (built):** the [auth card frame](#auth-card-frame): a form of shadcn
  Fields, the two passwords in `PasswordInput`, each with its own show or hide button.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: the auth card frame; one form column.
  - COMPONENT TYPES: labelled inputs; password InputGroups with a show or hide button;
    full-width primary button; footer link.
  - DATA FIELDS: name; email; password; password confirmation; return path.
- **PROOF PASS:** Pass (step 2b), against shadcn's login block: `register`, `register-error`
  ("Passwords do not match", the confirmation shown) and `register-success` (the toast and
  the verification notice on Log in; the sign-up was answered by the script, so no account
  was made), each on desktop and phone, light and dark.
- **NOTES:** Code: `src/views/Register.tsx`. The return path (`next`) survives email
  verification.

### Forgot password

- **SCREEN NAME:** Forgot password ("Reset your password", `/forgot-password/`)
- **PURPOSE:** Ask for a password reset email.
- **HOW USER GETS HERE:** "Forgot password?" on Log in; "Request a new link" on an expired
  reset link.
- **WHAT'S ON THE SCREEN:** the [auth card frame](#auth-card-frame) with "Reset your password"
  and "We'll email you a link to reset your password."; "Email"; "Send reset link"; footer
  "Remembered it? Back to sign in". After sending: "Check your inbox for a reset link. If it
  doesn't show up, check spam or try again."
- **PRIMARY ACTION:** "Send reset link".
- **SECONDARY ACTIONS:** "Back to sign in".
- **STATES:** "Sending link..."; email unavailable (toast "Password reset email is temporarily
  unavailable. Please contact support."); failure (toast "Unable to send reset email");
  sent (toast "If an account exists, a reset link has been sent." and the inbox message in
  place of the form).
- **NAVIGATION TYPE:** child page of Log in.
- **PATTERN CHOICE (built):** the [auth card frame](#auth-card-frame); the inbox message is
  an Alert in the form's place.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: the auth card frame; the form, or the message.
  - COMPONENT TYPES: labelled input; full-width primary button; Alert; footer link.
  - DATA FIELDS: email.
- **PROOF PASS:** Pass (step 2b), against shadcn's login block: `forgot-password`,
  `forgot-password-error` (email unavailable) and `forgot-password-sent`, each on desktop and
  phone, light and dark.
- **NOTES:** Code: `src/views/ForgotPassword.tsx`.

### Reset password

- **SCREEN NAME:** Reset password ("Set a new password", `/reset-password/`)
- **PURPOSE:** Set a new password from the emailed link.
- **HOW USER GETS HERE:** the reset email's link (`?token=`).
- **WHAT'S ON THE SCREEN:** the [auth card frame](#auth-card-frame) with "Set a new password"
  and "Choose a new password for your account."; "New password"; "Confirm password"; "Update
  password"; footer "Remembered it? Back to sign in".
- **PRIMARY ACTION:** "Update password" → [Log in](#log-in) (toast "Password updated. Please
  sign in again.").
- **SECONDARY ACTIONS:** "Back to sign in".
- **STATES:** "Updating password..."; mismatch and password-rule toasts; a missing, expired or
  reused link: "Reset link expired", "That reset link is no longer valid.", "Please request a
  new reset email to continue.", footer "Request a new link".
- **NAVIGATION TYPE:** flow page from the reset email.
- **PATTERN CHOICE (built):** the [auth card frame](#auth-card-frame); the expired link's
  message is an Alert.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: the auth card frame; the form, or the expired message.
  - COMPONENT TYPES: labelled inputs; full-width primary button; Alert; footer link.
  - DATA FIELDS: new password; confirmation; token (read once, then removed from the URL).
- **PROOF PASS:** Pass (step 2b), against shadcn's login block: `reset-password`,
  `reset-password-error` ("Passwords do not match"), `reset-password-success` (the toast on
  Log in; the reset was answered by the script) and `reset-password-expired`, each on desktop
  and phone, light and dark.
- **NOTES:** Code: `src/views/ResetPassword.tsx`. A reload after the token left the URL shows
  the expired state.

### Organization invite

- **SCREEN NAME:** Organization invite ("Organization Invite", `/team-invites/<token>/`)
- **PURPOSE:** Show an Organization invite and accept or decline it.
- **HOW USER GETS HERE:** an invite link a manager created in Organization Settings; back from Log in
  or Register after "Log in to accept" or "Create an account".
- **WHAT'S ON THE SCREEN:** the auth card frame without its aside: a people icon over the
  title "Organization Invite" (the page's h1). The body depends on the state, its buttons
  across the card, one under another:
  - Signed out: "Log in with the invited email address to see and accept this invite. New
    here? Create an account with that email address.", "Log in to accept" (primary), "Create
    an account" (outline).
  - Invite: the Organization's name; "<inviter> invited you to join as <Role>."; "Accepting
    does not change your current context. Switch to the Organization when you want to work in
    it."; "Accept invite" (primary), "Decline" (outline); an error Alert under them when a
    response fails.
  - Accepted: "Invite accepted."; "Switch to <Organization>" (primary), "Organization
    settings" (outline).
- **PRIMARY ACTION:** "Accept invite".
- **SECONDARY ACTIONS:** "Decline"; "Switch to <Organization>" → [My Templates](#my-templates)
  in that Organization; "Organization settings" → that Organization's
  [Organization Settings](#organization-settings); "Open templates" (declined) → My Templates
  in the current context; "Open settings" (an invite error) → [Account
  Settings](#account-settings).
- **STATES:** no token ("This invite link is missing a token."); "Checking your session...";
  signed out; "Loading invite..."; the invite; "Responding..."; accepted; already a member
  ("You're already a member of <Organization>." with the same two buttons); declined ("Invite
  declined. You did not join <Organization>.", "Open templates"); a different account ("You're
  signed in as <email>. This invite was sent to a different email address. Sign out, then log
  in or create an account with the invited email address to accept it.", "Sign out and
  continue", "Signing out..."); an invite error (the reason in an Alert, "Open settings").
- **NAVIGATION TYPE:** flow page (public shell).
- **PATTERN CHOICE (built):** the [auth card frame](#auth-card-frame) without its aside
  (`AuthCard`): the waiting lines with the shadcn Spinner, the errors as destructive Alerts.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: one centered card: the header (icon tile, title), the state's body, its
    buttons stacked.
  - COMPONENT TYPES: card; status line with a Spinner or check icon; paragraphs; full-width
    primary and outline buttons; destructive Alert.
  - DATA FIELDS: Organization name; inviter name or email; role; the signed-in email; state.
- **PROOF PASS:** Pass (step 2b), against shadcn's login block: `invite-signed-out`,
  `invite`, `invite-loading`, `invite-responding`, `invite-response-error`,
  `invite-accepted`, `invite-declined`, `invite-already-member`, `invite-wrong-account` and
  `invite-error`, each on desktop and phone, light and dark (the invite's API answered by the
  script for Acme Operations). Every state fits a 390px screen with its buttons in reach.
- **NOTES:** Code: `src/views/TeamInviteAccept.tsx`. The path keeps its legacy name. Accepting
  never switches the active context by itself. Until step 2b the title was a card title and
  the page had no h1, inside a second `<main>`.

### Shared run

- **SCREEN NAME:** Shared run (`/share/<token>/`)
- **PURPOSE:** Let anyone with the link work through a Run without an account: tick tasks
  and Sub-tasks, write notes and complete it (never rename or delete it).
- **HOW USER GETS HERE:** a share link someone copied from the Share run dialog.
- **WHAT'S ON THE SCREEN:**
  - Its own sticky header, no site shell: an icon tile, the Run's title, "Shared run
    snapshot", "Copy Link" (outline).
  - A summary card: a "Shared run snapshot" badge, the title, a status badge ("In Progress" or
    "Completed"), "Anyone with this link can tick tasks, add notes and complete this Run.", a
    progress box ("Run progress", "N%", "X of Y tasks"), a progress bar, and "Complete run" once
    every task is done while the Run is in progress.
  - One card per section: title and "Complete" or "X/Y"; per task: a checkbox, the title
    (struck through when done), the description, content blocks (Sub-tasks have their own
    checkboxes), "Task notes" (placeholder "Add links, outcomes, or context for this
    run...", "Save notes", "Saved to this run").
  - Closing banner: "Want to run your own checklist?", "Browse public templates and start a
    fresh run from a template that matches your workflow.", "Browse the Template Library".
- **PRIMARY ACTION:** tick a task.
- **SECONDARY ACTIONS:** "Copy Link"; notes; "Complete run" → the [Run complete
  dialog](#run-complete-dialog); "Browse the Template Library".
- **STATES:** loading (spinner); not found (toast "Run not found", then the Template Library);
  load error ("Unable to load run", the message, "Back"); completed ("Completed", checkboxes
  frozen, notes stay editable; a guest who completes the Run stays on it); always noindex.
- **NAVIGATION TYPE:** standalone page.
- **PATTERN CHOICE (built):** the teardown layout of [Detail page](#detail-page) (one
  column), with the progress in the summary card; sections as [Bordered list
  cards](#bordered-list-cards) panels; the closing card as the [Call-to-action
  banner](#call-to-action-banner) block. It keeps its own header, without the site shell.
- **REFERENCE IMAGES:** teardown-detail-1.png, prompts-2.png, home-7.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: sticky header (icon tile, title, "Copy Link"); a narrow column: the summary
    Card, a Card per section, the CtaBanner.
  - COMPONENT TYPES: icon tile; badges; heading; muted progress box; shadcn Progress; section
    Card with a count badge; task row with a checkbox; content blocks; notes Field;
    CtaBanner.
  - DATA FIELDS: Run (title, progress, task counts, status); section (title, completed and
    total); task (title, description, done, content blocks, notes).
- **PROOF PASS:** Pass (step 2a): `shared-run-desktop-light.png`, `-desktop-dark`,
  `-mobile-light` and `-mobile-dark` (a guest, signed out), against teardown-detail-1.png,
  prompts-2.png and home-7.png. Present: one centered column under a slim header; a summary
  block (title, status, progress); bordered section panels with a header row (title, count)
  over their task rows; the closing banner (text left, button right; stacked on phones). The
  teardown's facts strip is the summary card's progress box, and the reference has no
  checkboxes or notes. The wording and status of 2026-09-29 are in
  `tmp/design-review/decisions/` (`shared-run-*-guest.png`).
- **NOTES:** Code: `src/views/ChecklistRun.tsx` (shared mode) renders
  `src/components/run-execution/SharedRunView.tsx`. Guests never see who owns the
  Run, and never see its retired work. Until 2026-09-29 the page called itself "A read-only
  checklist run", though guests could always tick, write notes and complete it
  (`functions/api/handlers/checklists-shared.ts`).

### My Templates

- **SCREEN NAME:** My Templates (`/dashboard/templates/`)
- **PURPOSE:** List the active context's Templates and start work from them.
- **HOW USER GETS HERE:** sidebar "Templates"; account menu "My Templates";
  `/dashboard/` (redirect); Home "Open Dashboard"; a sign-in with no return path; after
  creating a Template; "Back to Templates" and the editor's back arrow; "Switch to
  <Organization>" on an invite.
- **WHAT'S ON THE SCREEN:**
  - Page header: "My Templates", "1 template in your library" or "N templates in your library"
    (no count while the list loads or when it failed to load), "New Template" (role-limited).
  - Toolbar, each field with its label (stacked on phones): "Search" ("Search
    templates..."); "Visibility" ("All", "Public", "Private"); "Sort by" ("Most Recent",
    "Alphabetical", "Most Tasks"); grid and list buttons ("Show templates in grid view", "Show
    templates in list view").
  - Grid (1, 2, then 3 columns): cards with a muted top holding the type's icon tile and, on
    its corner, the actions menu ("Actions for <title>"); up to 2 category badges and "+N";
    the title (its link covers the card); the description; "N sections", "N tasks"; "Public"
    or "Private"; a "Start Run" button over the muted top on hover (pointer only).
  - List: rows with an icon tile, the title (a link), the description, "N sections", "N
    tasks", "Public" or "Private", and "Start Run", "Edit", "Delete" (under the row on
    phones; on hover, focus or touch from `md`).
- **PRIMARY ACTION:** open a Template → [Template detail](#template-detail).
- **SECONDARY ACTIONS:** "New Template" → [Template editor](#template-editor); "Start Run" →
  [Start a Run dialog](#start-a-run-dialog); "Edit"; "Delete" → [Delete
  confirmations](#delete-confirmations); search; filter; sort; grid or list.
- **STATES:** "Loading templates..."; a load error ("Couldn't load your templates",
  "Something went wrong while loading. Check your connection and try again.", "Retry"; or
  "Your session has ended. Sign in again to continue.", "Sign in"); empty ("No templates
  found", "Create your first template to get started", "Create Template"); no matches ("Try
  adjusting your search or filters"); role-limited actions (runners: Start Run only; viewers:
  none); grid or list (remembered per user).
- **NAVIGATION TYPE:** root section (the console home).
- **PATTERN CHOICE (built):** the console's page header and toolbar (labelled search and
  selects, the grid and list buttons); `MediaCard`s with the muted top of [Section row over a
  card grid](#section-row-over-a-card-grid), as in the Template Library; list mode as shadcn
  `Item` rows; the empty and error states as the shadcn Empty; deletes through
  `ConfirmDialog`.
- **REFERENCE IMAGES:** prompts-4.png, home-2.png. The reference has no console.
- **STRUCTURE (built):**
  - LAYOUT ZONES: page header (h1, count, New Template; the button under the text on phones);
    toolbar; results (the grid or the list); empty or error state in their place.
  - COMPONENT TYPES: labelled search field; labelled selects; toggle buttons with pressed
    states; `MediaCard` with a corner actions menu and a hover overlay; `Item` row with
    actions; shadcn Empty; `AlertDialog`.
  - DATA FIELDS: Template (type, title, description, categories, section count, task count,
    visibility); role permissions.
- **PROOF PASS:** Pass (step 2a): `my-templates-grid`, `my-templates-list`,
  `my-templates-empty`, `my-templates-loading`, `my-templates-card-menu` and
  `my-templates-delete-dialog`, each `-desktop-light`, `-desktop-dark`, `-mobile-light` and
  `-mobile-dark`, against prompts-4.png and home-2.png. Present: a header row over the
  results with the search beside it; a grid of cards with a muted icon area, a category line,
  the title and a 2-line description. The reference's chip row is the Visibility and Sort by
  selects here, and its "Explore all N" heading the page's h1 and count.
- **NOTES:** Code: `src/views/Templates.tsx`, `src/components/dashboard/TemplateCard.tsx` and
  `TemplateListItem.tsx`. The list follows the active Ownership Context.

### Template detail

- **SCREEN NAME:** Template detail (`/dashboard/templates/<id>/`)
- **PURPOSE:** Review one Template, run it, share it and manage it.
- **HOW USER GETS HERE:** a title on My Templates; "From <template>" on My Runs; after "Save"
  on a public template page or a copy; "View template" on the editor's read-only notice.
- **WHAT'S ON THE SCREEN:**
  - Breadcrumb: "My Templates" › the title.
  - Header: the type's icon tile; the title; the description (or "Review template structure,
    metadata, and run actions."); a "Public" or "Private" badge, and beside "Public" a "View
    public template" link to its live public page (the URL Share gives), or "Public page
    unavailable until its creator sets a username" (an Organization's: "Public page unavailable
    until its Organization has a slug") when it has none; actions: "Share" and "Edit"
    (roles that can edit), or a copy button for others ("Copy to Organization", "Copy to My
    Templates", "Upgrade to copy template", "Checking plan...", "Copying...", "Loading..."),
    "View runs" (signed in), "Start Run", and "Template actions" (roles that can edit). Beside
    it (under it on phones),
    the stats panel: "Total Tasks" and "Sections".
  - An Organization error notice when the role is unknown ("Start Run waits until they load.
    Check your connection and try again.", "Retry"); no longer shown, since a private
    Organization Template opens only at its Organization's URL (TD-82).
  - "Required tools" (only when the Template has tools): the public template page's list,
    above "Template Structure".
  - "Template Structure": the public template page's section cards, always open: numbered
    sections (title, "N tasks") with their numbered tasks (title, description, content
    blocks).
  - "Details": "Created", "Last updated", "Visibility" (a switch labeled "Public" or
    "Private").
  - "Categories & Tags": the categories or "No categories assigned"; the tags or "No tags
    assigned".
  - "Activity" (roles that may see history): entries (label, who, date and time; an
    Agent's change names its Run Key, "<Run Key name> via MCP · authorized by <user>", as the
    run's Activity does), or "Loading template history...", "Template history is unavailable
    right now.", "No template history has been recorded yet."; with 8 entries shown, "View all
    activity", which shows the latest 100 ("Showing the latest 100 entries." when it reaches
    them).
- **PRIMARY ACTION:** "Start Run" → [Start a Run dialog](#start-a-run-dialog).
- **SECONDARY ACTIONS:** "Share" → [Share link dialog](#share-link-dialog); "Edit" →
  [Template editor](#template-editor); "View runs" → [My Runs](#my-runs) of the context the
  page shows, filtered to this Template; the copy button; the visibility switch; "Template
  actions" → "Duplicate", "Export JSON" (or "Upgrade to export"), "Transfer to Organization"
  (the owner of a Personal Template) → [Transfer to Organization
  dialog](#transfer-to-organization-dialog), "Delete" ([Action menus](#action-menus)).
- **STATES:** "Loading template..."; a load error ("Unable to load template", the message,
  "Try again", "Back to Templates"); not found ("Template Not Found", "This template does not
  exist or you do not have access to it."); read-only for runners, viewers and other contexts;
  "Creating..." while sharing; visibility toasts ("Template is now public", "Template is now
  private").
- **NAVIGATION TYPE:** child page of My Templates.
- **PATTERN CHOICE (built):** the [Detail page](#detail-page) block shared with the public
  template page (`DetailPageLayout`: breadcrumb My Templates › title, header with the actions,
  stats panel), then `TemplateSectionList` and shadcn Cards for the details, categories and
  tags, and Activity (`ActivityList`).
- **REFERENCE IMAGES:** pattern-detail-1.png, pattern-detail-2.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: breadcrumb; a two-column header (icon tile, title, description, badge,
    actions; the stats panel on the right, under it on phones); notice; a separator; "Required
    tools" (when the Template has tools); "Template Structure"; a 2-column grid of Cards
    (Details, Categories & Tags; stacked on phones);
    the Activity Card.
  - COMPONENT TYPES: breadcrumb; icon tile; badge; outline and primary buttons; dropdown
    menu; `Stat`; section cards with numbered tasks; switch with label; badge list; `Item`
    history rows; `AlertDialog`; Share link dialog.
  - DATA FIELDS: Template (title, description, visibility, Required tools, sections and
    tasks, created and updated dates, categories, tags); history entries (label, actor, time);
    role permissions; plan state.
- **PROOF PASS:** Pass (step 2a): `template-detail`, `template-detail-loading`,
  `template-detail-actions-menu`, `template-detail-delete-dialog` and
  `template-detail-share-dialog`, each on desktop and phone, light and dark, against
  pattern-detail-1.png and pattern-detail-2.png. Present: the breadcrumb row; a two-column
  header (icon tile, big title, muted description, a row of outline buttons; a panel on the
  right); a divider, then the content sections. Not built: the reference's section nav
  beside the content (the sections follow one another); "Updated <date>" is "Last updated"
  in Details, as before.
- **NOTES:** Code: `src/views/TemplateDetail.tsx`. An Organization's Template follows the
  viewer's role in that Organization. A private one opened at another context's URL shows
  "Loading template..." while the URL is replaced with its Organization's; a public one stays
  where it was opened, read-only from any other context.

### Template editor

- **SCREEN NAME:** Template editor (`/dashboard/templates/new/` and
  `/dashboard/templates/<id>/edit/`)
- **PURPOSE:** Create a Template or edit one: its settings, search fields, sections, tasks and
  content blocks.
- **HOW USER GETS HERE:** "New Template" (page header or sidebar), "Create Template"; "Edit" on
  a card, a list row or Template detail; "Resume template draft" in Billing.
- **WHAT'S ON THE SCREEN:**
  - Editor header (sticky under the console's top bar): back arrow ("Back to templates"),
    the draft's title ("New Template" or "Untitled Template"), an "Editing" badge when editing
    (from `sm`), "Outline" (below `lg`), "Preview" (from `sm`; in "More actions" on phones),
    "Save", a theme toggle (from `sm`; the sidebar has it on phones), "More actions". Preview
    and the theme toggle leave the bar on phones, so the title and Save keep their room.
  - Notices when needed: "Error" with the problems (such as "Required tools: give tool 2 a
    name." or "Required tools: tool 1's URL must start with http:// or https:// and have no
    spaces.", and "Load latest version" after a conflict); "Unsaved template draft" ("Restore draft", "Discard"); "Unsaved template draft
    in <context>" ("Switch to <context>", "Discard"); plan or session notices ("Upgrade to Pro
    to save this template" with "Upgrade to Pro", "Organization plan limit", "Upgrade
    unavailable", "Signed out" with "Sign in").
  - Create only: "Generate from Clipy" ("Paste a public Clipy video link to fill this editor
    with an unsaved, editable draft.", a URL field "https://clipy.online/video/…", "Generate
    draft").
  - Outline: a card beside the form from `lg`, in view while the form scrolls; below `lg`, a
    bottom sheet ("Outline") that the header's "Outline" opens and that closes on the picked
    or added entry, moving focus to its form. "Template Settings", "Search & SEO";
    "Sections" with "Add section"; per section: a drag handle ("Drag <section>"), collapse or
    expand, the title, "Add task to <section>", "Remove <section>"; per task: a drag handle,
    the title, "Remove <task>". A double click on a section's or task's title renames it in
    place (Enter or leaving the field keeps the new title, Escape drops it). On a touch screen
    the drag handles give way to "Move <entry> up" and "Move <entry> down" buttons.
  - Panel (beside the outline from `lg`, the page's one column below it), titled by the
    selection:
    - "Template Settings": "Template Name", "Goal / Summary", "Template Type" ("Checklist",
      "Recipe"), "Categories" ("Select categories..."), "Tags" ("Add tag..."), "Required
      tools" ("The apps or services someone needs to run this template. Each one links to its
      website."; per tool a bordered card: "Tool N", "Remove tool N", "Name" ("Time tracker"
      as placeholder), "URL" ("https://"), and a "Required" switch, on for a new tool; "Add
      tool", disabled at 20 with "A template can list up to 20 tools."), "Public Template"
      switch ("Make this template visible in the public library").
    - "Search & SEO": "Search Title", "URL Slug", "Search Description", "Preview".
    - "Section Settings": "Section Title", "Tasks in section".
    - "Task Details": "Task Title", "Description (Optional)", "Content Blocks" with "Add
      Block" and block cards (drag handle, or "Move <type> block up" and "down" on a touch
      screen; the type; "Remove <type> block"), or "No content blocks yet".
    - Prompts: "Select a task from the outline to edit its instructions and attached
      content." and "Add a section from the outline to start building this template."
- **PRIMARY ACTION:** "Save". A create returns to [My Templates](#my-templates); an edit stays
  (toast).
- **SECONDARY ACTIONS:** "Preview" → [Template preview dialog](#template-preview-dialog); "Add
  Block" → [Add Block popover](#add-block-popover); "More actions" → "Discard changes" (and
  "Preview" on phones); "Outline" (below `lg`); the back arrow; reorder by drag, the arrow
  keys or the Move buttons; "Generate draft".
- **STATES:** loading (spinner); load error ("Unable to load template", "Back to Templates");
  checking permission (spinner); read-only ("You can't edit this template" or "You can't
  create templates here", with the role or owner reason, "View template", "Back to
  Templates"); "Saving...", "Uploading...", "Generating..." (Save disabled); locked while a
  create saves or a Clipy draft generates; unsaved changes ([browser
  confirm](#browser-confirm-prompts)); conflict; plan limit; session ended; kept drafts.
- **NAVIGATION TYPE:** child page; the panel changes in place with the outline selection.
- **PATTERN CHOICE (built):** an editor top bar; from `lg` a two-pane body (the outline as a
  [Left category nav](#left-category-nav)-style column that stays in view, the form panel with
  shadcn Field groups and Cards); below `lg` one column, with the outline in a Sheet; a Dialog
  for the preview; a DropdownMenu for Add Block.
- **REFERENCE IMAGES:** pattern-detail-2.png (section nav beside content). The reference has
  no editor.
- **STRUCTURE (built):**
  - LAYOUT ZONES: sticky editor header; alerts and notices; the Clipy Card (create); body: from
    `lg` the outline Card (18rem, sticky, scrolling on its own when long) beside the form
    panel; below `lg` the form panel alone and the outline in a bottom Sheet.
  - COMPONENT TYPES: icon button; badge; outline, ghost and primary buttons; dropdown menus;
    Alerts; mode buttons; tree list with drag handles, Move buttons (touch) and row actions;
    labelled Fields (input, textarea, select, multi-select, tag input, switch); block cards;
    Empty; Sheet; Dialog.
  - DATA FIELDS: Template (title, description, type, categories, tags, Required tools (name,
    URL, required), public, search title, URL slug, search description); sections (title,
    tasks); tasks (title, description, content blocks); save state; kept drafts.
- **PROOF PASS:** Pass (step 2a): `editor-new`, `editor-task` (a Template open on a task),
  `editor-add-block-menu`, `editor-preview-dialog`, `editor-loading` and `editor-read-only`,
  each on desktop and phone, light and dark, and `editor-outline-sheet-mobile-light` and
  `-dark`, against pattern-detail-2.png. Present: a narrow nav column beside the content that
  stays in view while the content scrolls, its active item marked. The reference's nav is a
  plain link list; the outline also adds, removes, collapses and reorders its entries. On a
  phone (390px) the page is one column with no sideways scroll, and every entry is reachable
  from the Outline sheet.
- **NOTES:** Code: `src/views/TemplateEditor.tsx`; the outline's placement is
  `src/components/template-editor/TemplateEditorOutline.tsx`, the Move buttons
  `ReorderMoveButtons` in `ReorderHandle.tsx`. A drag handle shows on a fine pointer (a mouse)
  and the Move buttons on a coarse one (a touch screen), by CSS (`pointer-fine:hidden`,
  `pointer-coarse:hidden`); the keyboard moves an entry with its handle's arrow keys.

### My Runs

- **SCREEN NAME:** My Runs (`/dashboard/runs/`, and `/dashboard/runs/?template=<id>` filtered to
  one Template)
- **PURPOSE:** List the active context's Runs with their progress, and act on them.
- **HOW USER GETS HERE:** sidebar "Runs"; account menu "My Runs"; "Runs" on the Run page; after
  completing a Run; "View runs" on [Template detail](#template-detail), filtered to that
  Template.
- **WHAT'S ON THE SCREEN:**
  - Page header: "My Runs", "N in progress, M completed".
  - Toolbar, each field with its label (stacked on phones): "Search" ("Search runs...");
    "Template" ("All templates", then each Template the context's Runs came from, by title, and
    the Template in the URL even when it has none; "Unknown template" for one the context
    does not know); "Status" ("All Runs", "In Progress", "Completed"). The three combine. The
    Template lives in the URL (`?template=<id>`), so a link, a reload and Back keep it; search
    and status do not.
  - From 90rem (1440px), a table ("Runs") instead of rows: "Run" (the title, at most two lines
    with the whole title as its tooltip, and the attention badge), "Template" (a link),
    "Status" (its icon and badge), "Progress" (the bar and "x/y"), "Started by", "Origin"
    ("Web", "MCP" or "Unknown"), "Started", "Updated", and the row's actions, where
    "Revalidate" and "Stop sharing to update" are icon buttons named by their labels; a value
    the Run never recorded shows "—".
  - Below 90rem, rows: a status icon tile; the title (a link to `/dashboard/runs/<id>/`); meta ("From
    <template>" as a link, "Started <date>", "Completed <date>"); a progress bar (the Run's
    progress, Sub-tasks included) with "x/y" (tasks only, as on the Run page); a
    status badge ("Completed" or "In Progress"); a "Needs revalidation" or "Shared snapshot is
    out of date" badge (outline, with a warning icon) or "Shared"; actions (under the row on
    phones; on hover, focus or touch from `xl`): "Revalidate", "Stop sharing to update",
    "Continue" (primary) or "View" (outline), and "Run options".
- **PRIMARY ACTION:** "Continue" → [Run page](#run-page).
- **SECONDARY ACTIONS:** "View"; "Revalidate"; "Stop sharing to update"; "Run options" →
  "Share Run", "Stop sharing", "Delete" ([Action menus](#action-menus)); search; filter.
- **STATES:** loading (5 skeleton rows); a load error ("Couldn't load your runs", "Retry" or
  "Sign in"); empty ("No runs found", "Start a run from one of your templates", "Browse the
  Template Library" → [Template Library](#template-library)); a Template with no Runs ("No runs
  of this template yet", "Runs started from <template> appear here.", "Show all runs", which
  takes the Template out of the URL); no matches ("Try adjusting your search or filters"); "Revalidating...", "Stopping..."; actions follow the role in the Run's
  Organization.
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (built):** the console's page header and toolbar; rows as [List rows with
  thumbnail](#list-rows-with-thumbnail), shadcn `Item`s with the status icon tile in the
  thumbnail's place (`RunListItem`); deletes through `ConfirmDialog`.
- **REFERENCE IMAGES:** teardowns-3.png, teardowns-4.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: page header; toolbar; a list of rows.
  - COMPONENT TYPES: labelled search field; labelled select; `Item` row (icon tile, text,
    shadcn Progress, badges, buttons, dropdown menu); Skeleton rows; shadcn Empty;
    `AlertDialog`; Share link dialog.
  - DATA FIELDS: Run (title, status, progress, task counts, started and completed dates,
    shared, stale); source Template (title, link); permissions.
- **PROOF PASS:** Pass (step 2a): `my-runs`, `my-runs-empty`, `my-runs-loading`,
  `my-runs-options-menu` and `my-runs-delete-dialog`, each on desktop and phone, light and
  dark, against teardowns-3.png and teardowns-4.png. Present: rows with a leading tile, a text
  column (title, muted meta) and trailing controls. The reference's thumbnail is the status
  icon tile and its trailing chevron the Run's actions.
- **NOTES:** Code: `src/views/Dashboard.tsx` (the list view is RunsDashboardView, a row
  `RunListItem`; the Template filter is `src/features/dashboard-runs/runsTemplateFilter.ts`). Rows link to
  a Run's one URL, `/dashboard/runs/<id>/`, which Start Run opens too.

### Run page

- **SCREEN NAME:** Run page (`/dashboard/runs/<id>/`)
- **PURPOSE:** Work through a Run task by task, add notes, complete it, share it.
- **HOW USER GETS HERE:** Start Run; the title, "Continue" or "View" on My Runs. The older
  `/run/<id>` address answers 308 with this one.
- **WHAT'S ON THE SCREEN:**
  - Page header: the title (a labelled "Run title" field while renaming); "X of Y tasks
    finished"; a "Completed" or "In Progress" badge, a "View only" badge, and from `xl` a
    progress bar with "N%"; actions (under the text on phones): "Runs" (back), "Rename" (or
    "Save title" and "Cancel"), "Complete run" when every task is done, a "Shared" badge,
    "Share", "Stop sharing".
  - Under the header, the Run's provenance: "Started by <name> via Web", or "Started by <Run
    Key> via MCP · authorized by <name>" (no origin when it is unknown), "Started <date and
    time> · Updated <date and time>", and "Show Details" ("Hide Details"), which opens a list:
    "Run ID" (with "Copy run ID"), "Template", "Template version", "Resource owner"
    ("Personal" or the Organization's name), "Created by", "Started by", "Assigned to" and
    "Completed by" (when set), "Origin" ("Web", "MCP" or "Unknown"), "Run Key" and
    "Authorized by" (MCP), "Created", "Started", "Updated", "Completed", "Revision". A value
    the Run never recorded reads "Not recorded".
  - "Required tools" (only when the source Template has tools and the viewer may use that
    Template, as for its title in Show Details): a card, as "Activity" is, with one row per
    tool (its name as a link that opens the tool's site in a new tab, the site's host, and a
    "Required" or "Optional" badge), two columns from `sm`. They are the source Template's
    current tools, not a copy the Run keeps. The shared run page does not show them.
  - An Organization error notice when the role is unknown ("This run's actions wait until they
    load. Check your connection and try again.", "Retry"); no longer shown, since a Run opens
    only at its own context's URL (TD-82).
  - Below `xl`: a progress block ("N% complete", "X of Y tasks finished", "Task N of M",
    "Tasks" → [Run tasks sheet](#run-tasks-sheet), a progress bar).
  - Task panel (a bordered card): "<section> / Task N of M"; a task checkbox; the task's
    title and description; content blocks, or "No additional content for this task"; "Task
    notes" ("Save notes", "Saved to this run").
  - A footer pinned to the bottom of the window: "Previous", the primary action ("Mark
    Complete", "Next Task", "Next unfinished task", "Finish Run", "Run completed" or "View
    only"), "Next" (on phones Previous and Next show only their arrows; their names stay).
  - "Removed from Template (N)" (collapsed; the retired work, read-only).
  - "Activity": entries (label, who, time), or "Loading run history...", "Run history is
    unavailable right now.", "No run history has been recorded yet."; with 8 entries shown,
    "View all activity", which shows the latest 100 ("Showing the latest 100 entries." when it
    reaches them).
  - From `xl`, a right column that stays in view: "Progress", the task list by section,
    "Overall Progress" with "X / Y tasks" and a bar.
- **PRIMARY ACTION:** "Mark Complete".
- **SECONDARY ACTIONS:** "Previous" and "Next"; pick a task; notes; "Rename"; "Share" →
  [Share link dialog](#share-link-dialog); "Stop sharing"; "Complete run" and "Finish Run" →
  [Run complete dialog](#run-complete-dialog); "Runs".
- **STATES:** loading (spinner, also while a Run opened at another context's URL moves to its
  own); not found (toast "Run not found", then My Templates); a load
  error ("Unable to load run", the message, "Back"); in progress; every task done (the
  completion prompt, and "Complete run" stays); completed (frozen: "Run completed"); view only
  (viewers); role unknown (the notice); unsaved notes ([browser
  confirm](#browser-confirm-prompts)); "Creating link...", "Stopping..."; toasts ("Run title
  updated", "Sharing stopped. The old link no longer works.").
- **NAVIGATION TYPE:** child page of My Runs.
- **PATTERN CHOICE (built):** the console's page header with actions (`RunPageHeader`); a
  two-column body from `xl` (the task panel, and the task list as a [Left category
  nav](#left-category-nav)-style column on the right, in view while the task scrolls); a
  sticky action bar; a Sheet for the task list below `xl`.
- **REFERENCE IMAGES:** pattern-detail-2.png, pattern-detail-3.png. The reference has no run
  view.
- **STRUCTURE (built):**
  - LAYOUT ZONES: page header; provenance; the Required tools card (when shown); notice;
    progress Card (below `xl`); main column (the task
    panel Card with its header, content, notes and sticky footer; retired work; the Activity
    Card); right column (from `xl`, sticky).
  - COMPONENT TYPES: labelled title field; badges; buttons; shadcn Progress; checkbox;
    content blocks; notes Field (textarea, button, saved indicator); disclosure; `Item`
    history rows; task list (nav with current-task marker); Sheet.
  - DATA FIELDS: Run (title, status, progress, task counts, shared, sections, tasks, notes,
    retired work, history; the source Template's Required tools); selected task (section,
    position, title, description, content, done); permissions.
- **PROOF PASS:** Pass (step 2a): `run-page` and `run-page-changelog` (the window, at the
  top and scrolled to the Activity), `run-page-loading`, `run-share-dialog`, each on desktop
  and phone, light and dark, and `run-tasks-sheet-mobile-light` and `-dark`, against
  pattern-detail-2.png and pattern-detail-3.png. Present: a header row with actions; a
  two-column body with a nav column that stays in view (on the right here, as before) and
  the content; below `xl` one column. The reference has no action bar or checkboxes.
- **NOTES:** Code: `src/views/ChecklistRun.tsx`, with `RunPageHeader`, `TaskExecutionPanel`,
  `MobileRunProgress` and `RunProgressSidebar` in `src/components/run-execution/`. The same
  view renders the shared run.

### Import Templates

- **SCREEN NAME:** Import Templates (`/dashboard/import-templates/`)
- **PURPOSE:** Import Templates from a portable pack, and export the context's Templates.
- **HOW USER GETS HERE:** sidebar "Import Templates" (in the sidebar sheet on phones).
- **WHAT'S ON THE SCREEN:**
  - Page header: "Import Templates", "Move checklist packs between environments or bootstrap
    your template library from a portable JSON sample.", a "JSON packs" badge (from `sm`).
  - Cards, one under another in the narrow page width. The first, "Template JSON Import &
    Export", "Export portable template packs or import compatible JSON files for
    <context>.", a "Portable packs" badge:
    - A plan notice when the plan does not allow it ("Pro feature" or "Paid Organization
      feature", "Upgrade to Pro" or "Upgrade unavailable"), or "Couldn't check your plan" with
      "Retry".
    - "Editor access required" for Organization roles that cannot edit.
    - Counts: "My Templates" (or "Organization Templates"), "Public", "Private".
  - "Export Templates": a switch "Include public community templates" with its note;
    "Export Portable Pack".
  - "Import Templates": "Import visibility" ("Preserve visibility from file", "Force public",
    "Force private") and "Templates missing a visibility flag default to private."; a file
    field "Select a YAML, JSON, or Markdown template file"; "Need an example? Download sample
    portable pack".
  - After choosing a file, "Import Preview" (file name, "N templates", "N public", "Templates
    to import:", warnings, "Import Policy (enforced)", "Import Notes:", "Confirm Import",
    "Cancel").
  - After an import, "Last Import Result" ("N attempted", "N imported", "N failed",
    "Imported:", "Failed Templates").
- **PRIMARY ACTION:** "Confirm Import".
- **SECONDARY ACTIONS:** "Export Portable Pack"; "Download sample portable pack"; "Upgrade to
  Pro".
- **STATES:** plan loading, Free, paid, unknown; role-limited (controls off); the Template
  list failed ("Couldn't load your templates", "Retry"); "Exporting...", "Importing...";
  toasts ("Failed to export templates", "Failed to import templates", "Log in to export your
  templates").
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (built):** the console's page header and shadcn Cards: an overview card
  (notices as Alerts, the counts as `Stat`s), an Export card and an Import card with Field
  groups; the preview and the result as Cards, their Templates as `Item` rows and their
  warnings, policy, notes and failures as Alerts.
- **REFERENCE IMAGES:** none (the reference has no console).
- **STRUCTURE (built):**
  - LAYOUT ZONES: page header; a narrow column of Cards: overview (notices, counts), Export,
    Import, then the preview and the last result when there are any.
  - COMPONENT TYPES: badges; Alerts; three `Stat`s; horizontal switch Field; buttons; labelled
    select; labelled file input; link button; `Item` rows; card footer with Confirm Import and
    Cancel.
  - DATA FIELDS: context name; Template counts; plan state; import visibility; file; preview
    (Templates, warnings, limits); result (attempted, imported, failed).
- **PROOF PASS:** Pass (step 2a), against shadcn's Card and Field (the reference has no
  console): `import`, `import-preview` (the sample pack picked) and `import-result` (after
  Confirm Import), each on desktop and phone, light and dark. Present: every field has its
  visible label and description, the notices and counts use theme colors only, and the
  preview's Confirm Import and Cancel sit in the card's footer.
- **NOTES:** Code: `src/views/TemplateImportExport.tsx`, `src/components/TemplateBackup.tsx`,
  `TemplateImportPreview.tsx` and `TemplateImportResult.tsx`. Import and export need a paid plan in
  the active context.

### Archive

- **SCREEN NAME:** Archive (`/dashboard/archive/`)
- **PURPOSE:** Restore deleted Templates and Runs of the active context.
- **HOW USER GETS HERE:** sidebar "Archive" (in the sidebar sheet on phones).
- **WHAT'S ON THE SCREEN:** page header "Archive", "Archived templates and runs. Restore one to
  put it back in your list.", with a "Loading" or "N archived" badge under it; two Cards, side
  by side from `lg`: "Archived templates" and "Archived runs" (each with its count as a
  badge); rows: the title, "Archived <date>", "Restore".
- **PRIMARY ACTION:** "Restore".
- **SECONDARY ACTIONS:** "Retry" on a failed list.
- **STATES:** per list: "Loading archived templates..." (or runs); an error ("Couldn't load
  your archived templates", "Retry"); empty ("No archived templates", "No archived runs");
  "Restoring..."; role-limited (restoring a Template needs editor or above, a Run admin or
  above; the items stay listed); a restore the plan refuses shows the API's reason; an item restored
  elsewhere reloads the lists.
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (built):** the console's page header; two panels as in [Bordered list
  cards](#bordered-list-cards) (prompts-2.png "By role": header row, list rows with a trailing
  action), shadcn Cards holding `Item` rows.
- **REFERENCE IMAGES:** prompts-2.png, prompts-3.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: page header with the count badge; a 2-column grid of Cards (stacked below
    `lg`).
  - COMPONENT TYPES: Card (header with icon, title, count badge; rows); `Item` row (title,
    date, outline button); `ListLoadErrorState`.
  - DATA FIELDS: archived item (title, archived date, kind); list state; role permissions.
- **PROOF PASS:** Pass (step 2a): `archive` and `archive-empty`, each on desktop and phone,
  light and dark, against prompts-2.png and prompts-3.png. Present: bordered panels with a
  header row (title, count) over list rows with a trailing action. Two panels here, not three,
  and no "View all".
- **NOTES:** Code: `src/views/Archive.tsx` and
  `src/components/dashboard/ArchiveRecoverySection.tsx`. Every "Delete" in the app moves the item here.

### Account Settings

- **SCREEN NAME:** Account Settings (`/dashboard/settings/`, always Personal)
- **PURPOSE:** Manage what is the User's in every context: the profile, security, Run Keys
  and Personal billing, with the account's Organization choices.
- **HOW USER GETS HERE:** account menu "Settings" (from any context); sidebar "Settings" and
  the context switcher's "Settings" in Personal; the "Account Settings" link on
  [Organization Settings](#organization-settings); "Open settings" on an invite; "Manage Pro"
  or "Manage subscription" on Pricing; Stripe's return.
- **WHAT'S ON THE SCREEN:** page header "Account Settings", "Your profile, sign-in, Run Keys
  and Personal billing. They stay yours in every context." ("Your profile, sign-in and
  Personal billing." where the Run Key UI is off); stacked cards:
  - "Profile Information": "Profile Picture" (the avatar with "Upload avatar" and "Remove
    avatar" buttons, always shown); "Email" (disabled, "Email cannot be changed"); "Full
    Name"; "Username" (after "@"); "Public profile URL:" (a link); "Update Profile" in the
    card's footer.
  - "Personal billing": "Current plan:" with the plan; "Resume template draft" when a draft
    is kept; the status error with "Retry"; "Billing checkout is currently unavailable.";
    "Manage subscription" or "Upgrade to Pro — $9/month" in the card's footer.
  - "Agent Access" (only where the Run Key UI is enabled): "Permissions are fixed when you
    create a key" (make a new key to change them; no key can delete or publish templates,
    change the profile, reach Organizations or billing); "Key name" ("Codex SOP Runner");
    "Permissions": a card per permission with its checkbox, title and description ("Read
    templates", "Write templates", "Read runs", "Write runs"), all but "Write templates"
    ticked for a new key, and unticking a read also unticks the writes that need it;
    "Create Run Key"; a new key's panel ("Copy <name> and connect your agent", the secret,
    "Copy key", "I have saved this key"); "MCP connection" (the endpoint with a copy
    button); "Personal Run Keys" (name, "Active" or "Revoked", prefix, the key's
    permissions as badges, created and last used, "Revoke"), or "No Run Keys yet."
  - "Organizations": "Incoming invites" ("Accept"); a create form ("Organization name",
    "Slug", "Create Organization"); "Your Organizations" (name, role, "Select", which opens
    that Organization's settings); "Create or select an Organization to share templates and
    runs."
  - "Security": "Change password" ("Current password", "New password", "Confirm new password",
    "Sign out other sessions" switch with "Keeps you signed in on this device.", "Update
    password"); "Sessions" ("Quickly sign out other devices if you suspect misuse.", "Sign out
    other sessions").
- **PRIMARY ACTION:** "Update Profile".
- **SECONDARY ACTIONS:** billing actions; "Create Run Key", "Revoke" → [Revoke Run Key
  dialog](#revoke-run-key-dialog); "Accept", "Create Organization" and "Select" (each opens
  that Organization's settings); "Update password"; "Sign out other sessions".
- **STATES:** "Couldn't load your Organizations." with "Retry"; incoming invites and keys each
  load or fail on their own; no Run Key permission ticked: "Choose at least one permission."
  and "Create Run Key" disabled; busy labels ("Updating...", "Creating...", "Accepting...",
  "Opening billing...", "Revoking...", "Signing out...").
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (built):** each section a shadcn Card with Field groups, one column in the
  narrow page width. The proposal's section nav ([Left category nav](#left-category-nav)) or
  Tabs was not built: it would add navigation the page does not have (an open question).
- **REFERENCE IMAGES:** patterns-2.png, pattern-detail-2.png (section nav). The reference has
  no settings.
- **STRUCTURE (built):**
  - LAYOUT ZONES: page header; one column of Cards (the narrow page width): Profile
    Information, Personal billing, Agent Access, Organizations, Security.
  - COMPONENT TYPES: Card with a footer; avatar with visible buttons; labelled Fields
    (inputs, an InputGroup with "@", switches as horizontal Fields, selects); a FieldSet of
    checkbox choice cards (a `FieldLabel` around a horizontal `Field`: `Checkbox`,
    `FieldTitle`, `FieldDescription`) for Run Key permissions; `Item` rows (Run Keys with
    outline `Badge`s for their permissions, Organizations, invites, members); Alerts; copy
    InputGroups; `ActivityList` rows; `AlertDialog`.
  - DATA FIELDS: User (email, name, username, avatar); plan; Run Keys (name, prefix, status,
    permissions, created and last used); Organizations (name, role) and incoming invites;
    password fields.
- **PROOF PASS:** Pass (step 2a), against shadcn's Card and Field (the reference has no
  settings): `settings-personal` (admin, Personal), `settings-organization-owner` (the owner
  of an Organization: members, invites, activity), `settings-organization-editor` (an editor:
  the role note and Leave Organization) and `settings-revoke-key-dialog`, each on desktop and
  phone, light and dark. Present: every field has its visible label, every control is
  reachable on a phone, and nothing scrolls sideways at 390px. Run Key permissions (staging
  #257, merged 2026-09-30), against shadcn's Field choice cards: the Agent Access card as
  john on desktop and phone, light and dark, with an active key that may write templates
  and a revoked one (`tmp/design-review/merge-staging/agent-access-desktop-light.png`,
  `-phone-light`, `-desktop-dark`, `-phone-dark`), with "Write templates" ticked
  (`agent-access-create-write-templates-desktop-light.png`) and with nothing ticked
  (`agent-access-no-permission-desktop-light.png`). Present: each permission shows its
  title and description; Tab from "Key name" reaches the four checkboxes in order, then
  "Create Run Key", and Space ticks one; the cards stack in one column and nothing scrolls
  sideways at 390px.
  The Organization captures show what is now [Organization Settings](#organization-settings),
  from before #206 split it into its own page.
- **NOTES:** Code: `src/views/Account.tsx` (the route renders `src/views/DashboardSettings.tsx`,
  which re-exports it); the Organizations card is
  `src/components/account/AccountOrganizationsSection.tsx`; Agent Access is
  `src/components/account/AgentAccessSection.tsx`, and the permission names and rules are
  `src/lib/schemas/runKeyPermissions.ts`.

### Organization Settings

- **SCREEN NAME:** Organization Settings ("<name> Settings",
  `/dashboard/organization/<organizationId>/settings/`)
- **PURPOSE:** Manage one Organization: its billing, name and slug, invites, members and
  activity, or leave it. Nothing of the User's own (profile, security, Run Keys) is here.
- **HOW USER GETS HERE:** sidebar "Settings" and the context switcher's "Settings" in that
  Organization; "Select" on a row of [Account Settings](#account-settings)' "Your
  Organizations", or creating an Organization or accepting an incoming invite there;
  "Organization settings" on an accepted invite.
- **WHAT'S ON THE SCREEN:** page header "<name> Settings", "<name>'s billing, members and
  invites." and "Your profile, security and Run Keys are in Account Settings." (a link to
  Account Settings; "Your profile and security are in" where the Run Key UI is off); stacked
  cards:
  - "<name> billing": "Current plan:" with the plan; "Resume template draft" when a draft is
    kept; the status error with "Retry"; "Billing checkout is currently unavailable."; the
    Organization billing message ("Paid Organization entitlements apply while this
    Organization is selected." or "Personal subscriptions are managed from Personal.").
  - "<name>": "Your role: <role>", the role's description; "Organization avatar" (the
    avatar, or a people icon; for managers "Upload avatar" and "Remove avatar", saved at once:
    "Avatar updated successfully!", "Avatar removed successfully!"); for managers: a form
    ("Organization name", "Slug", "Description", "Save Organization") and invites ("Invite email", "Role",
    "Create link", the link with a copy button, "Pending invites" with "New link" and
    revoke); "Owners and admins manage Organization settings, invites, and activity." for
    others; "Members" (name, "You", email, role and status selects, labelled "Role" and
    "Status" on phones where they stack, "Make owner"); "Activity" for managers.
  - "Leave Organization" (not for its owner): "Leave <name> and return to your Personal
    context. …", "Leave Organization".
- **PRIMARY ACTION:** "Save Organization" (owners and admins).
- **SECONDARY ACTIONS:** "Create link", "New link" and revoke on invites; member role and
  status; "Make owner" and "Leave Organization" ask a [browser
  confirm](#browser-confirm-prompts); "Account Settings".
- **STATES:** role-limited controls (owners and admins manage); members, invites and activity
  each load or fail on their own ("Loading members...", "Couldn't load members."); until the
  user's Organizations load, a loading state, and for an Organization the user cannot open,
  the [404 page](#404-page); busy labels ("Saving...", "Leaving...").
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (built):** as Account Settings: a shadcn Card per section, one column in the
  narrow page width.
- **STRUCTURE (built):**
  - LAYOUT ZONES: page header; one column of Cards: <name> billing, <name>, Leave
    Organization.
  - DATA FIELDS: Organization (name, slug, avatar, description, role, members, invites,
    activity); plan.
- **NOTES:** Code: `src/views/OrganizationSettings.tsx`; the Organization's card is
  `src/components/account/TeamSettingsSection.tsx`, Leave is
  `src/components/account/LeaveOrganizationCard.tsx`, and billing is
  `src/components/account/BillingSection.tsx`, shared with Account Settings.

### 404 page

- **SCREEN NAME:** 404 page ("That page does not exist")
- **PURPOSE:** Say the address is not a page and offer a way home.
- **HOW USER GETS HERE:** any path no route matches (HTTP 404); an unknown feature slug or
  category (HTTP 200, noindex); an Organization URL the user cannot open, once their
  Organizations load (in the console shell, rendered by `OrganizationRouteGate`; it never
  says whether the Organization exists).
- **WHAT'S ON THE SCREEN:** a centered page hero: eyebrow "404", "That page does not exist",
  "The route <path> could not be found. Use the main navigation or head back to the home
  page." (the server's HTML says "This route"), "Return to home".
- **PRIMARY ACTION:** "Return to home" → [Home](#home).
- **SECONDARY ACTIONS:** the shell's navigation.
- **STATES:** the shell: the public shell for anyone not signed in and on public paths; the
  console shell for a signed-in user on a missing path under `/dashboard/`, once the session
  check answers (the server's HTML and the first render in the browser are the public shell).
  Titled "Page not found", `noindex, follow`, no canonical URL.
- **NAVIGATION TYPE:** system page.
- **PATTERN CHOICE (built):** [Page hero](#page-hero) (eyebrow, title, description, one
  button) with no card.
- **REFERENCE IMAGES:** home-1.png.
- **STRUCTURE (built):**
  - LAYOUT ZONES: a centered hero.
  - COMPONENT TYPES: `PageHero` (eyebrow badge, heading, paragraph, primary link button).
  - DATA FIELDS: the missing path.
- **PROOF PASS:** Pass (step 2b): `not-found` (public shell) and `not-found-console` (john,
  signed in, on `/dashboard/definitely-missing/`), each on desktop and phone, light and dark,
  and the feature and category 404s above (`feature-unknown`, `category-unknown`), against
  home-1.png. Present: the centered hero (eyebrow, big title, muted text, one button). The
  shells of 2026-09-29 under `/dashboard/`:
  `tmp/design-review/decisions/not-found-dashboard-desktop-signed-out.png`,
  `not-found-dashboard-desktop-signed-in.png`, `not-found-dashboard-mobile-signed-out.png` and
  `not-found-dashboard-mobile-signed-in.png`.
- **NOTES:** Code: `src/views/NotFound.tsx`, `src/app/not-found.tsx` and
  `src/components/NotFoundLayout.tsx`, which picks the shell. Next.js prerenders the page once
  and serves that HTML for every missing path, so the shell may change only after the session
  check, like the missing address in the text. Until 2026-09-29 the shell followed the path
  alone, so a signed-out visitor to a missing `/dashboard/` path saw console chrome.

## Overlays

### Public menu sheet

- **SCREEN NAME:** Public menu sheet
- **PURPOSE:** Give phones the header's links and actions.
- **HOW USER GETS HERE:** the public header's menu button ("Open menu"), below `md`.
- **WHAT'S ON THE SCREEN:** a sheet from the left titled "SERP Lists"; the "Site" navigation,
  with the header's menus as labelled groups: "Templates" ("Template Library",
  "Categories"), "Features" ("Template Builder", "Checklist Runs", "Public Sharing", "Import
  + Export"), then "Pricing" (the current page's link marked); a separator; the theme toggle
  with its label; signed out "Log in" (outline) and "Get started" (primary); signed in
  "Dashboard" (primary). The list scrolls when the screen is too short.
- **PRIMARY ACTION:** a link.
- **SECONDARY ACTIONS:** theme toggle; "Log in"; "Get started"; "Dashboard".
- **STATES:** signed out or signed in; it closes on any navigation, Back and Forward included.
- **NAVIGATION TYPE:** sheet.
- **PATTERN CHOICE (decided):** a shadcn Sheet with the header's menus as groups of links,
  the theme switch and the account actions ([Public shell](#public-shell)).
- **REFERENCE IMAGES:** home-mobile.png (the menu button).
- **STRUCTURE (built):**
  - LAYOUT ZONES: header (brand); link groups (a muted label over its links), then a link;
    divider; theme toggle; action buttons.
  - COMPONENT TYPES: sheet; group label; navigation link with an active state; toggle;
    buttons.
  - DATA FIELDS: group (label, links); link (label, href, active); signed-in flag.
- **PROOF PASS:** Pass (step 1): public-menu-mobile-light-signed-out.png,
  public-menu-mobile-dark-signed-out.png; the reference shows only the button
  (home-mobile.png), which now sits before the brand as there. The groups (2026-09-29):
  `tmp/design-review/decisions/phone-menu-sheet-mobile-signed-out.png`.
- **NOTES:** TBD which account actions the sheet lists when signed in (today only
  "Dashboard").

### Console phone navigation

Removed in step 1: the sidebar opens as a sheet on phones instead. The card records what it
replaced.

- **SCREEN NAME:** Console phone menu and bottom bar (removed)
- **PURPOSE:** Console navigation below `md` before step 1.
- **HOW USER GETS HERE:** the menu button ("Toggle menu") in the console's phone bar; the
  bottom bar shows below `md` except on paths containing "/edit" or "/new".
- **WHAT'S ON THE SCREEN:** a sheet from the left titled "SERP Lists": "New Template"
  (role-limited) and a search icon link (to the library); links "Home", "Dashboard",
  "Templates", "Import Templates", "Runs", "Browse Templates", "Categories", "Archive",
  "Settings"; at the bottom the theme toggle with its label and an account row (initial, name
  or "Account settings", "@username" or email) that opens Account Settings. The bottom bar
  ("Mobile console navigation"): "Home", "Templates", a round "New" (role-limited), "Runs",
  "Browse".
- **PRIMARY ACTION:** a link.
- **SECONDARY ACTIONS:** "New Template"; theme toggle; the account row.
- **STATES:** role-limited; the active item.
- **NAVIGATION TYPE:** sheet and a tab bar.
- **PATTERN CHOICE (decided):** replaced: the shadcn Sidebar opens as a sheet on phones and
  the bottom bar goes away ([Signed-in console shell](#signed-in-console-shell)).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):** the sidebar's structure, in a sheet.
- **PROOF PASS:** Pass (step 1): console-menu-mobile-light-signed-in.png,
  console-menu-mobile-dark-signed-in.png. Every link the phone menu had is in the sidebar:
  Home through the brand, Dashboard and Templates (the same page), Import Templates, Runs,
  Browse Templates as "Template Library" (named "Discover" until 2026-09-29), Categories,
  Archive, Settings, and the account row.
- **NOTES:** The old search icon link and round "New" link, which had no accessible name,
  are gone with it.

### Account menu

- **SCREEN NAME:** Account menu
- **PURPOSE:** Reach the console, the Public Profile, and sign out.
- **HOW USER GETS HERE:** signed in: the avatar button ("Account menu") in the site header
  on public pages; the account row ("Account menu") in the sidebar footer on console pages.
- **WHAT'S ON THE SCREEN:** the name (or "Your account") and email; "My Templates" (the
  console home) and "My Runs" in the current context, "Settings" (Personal Account Settings,
  where the account's settings live), "Profile" (only with a username; opens a new tab);
  "Sign out".
- **PRIMARY ACTION:** a destination.
- **SECONDARY ACTIONS:** "Sign out" → Home.
- **STATES:** no username (no "Profile"); "Signing out..."; a page with unsaved work asks
  first; a refused sign-out shows a toast and keeps the user.
- **NAVIGATION TYPE:** dropdown menu.
- **PATTERN CHOICE (decided):** a shadcn DropdownMenu from an avatar trigger: in the site
  header on public pages and in the sidebar footer on console pages.
- **REFERENCE IMAGES:** none (the reference has no accounts); home-1.png for the header's right
  zone.
- **STRUCTURE (built):**
  - LAYOUT ZONES: trigger; header (name, email); item group; separator; sign-out item.
  - COMPONENT TYPES: avatar trigger; menu label; link items; destructive item.
  - DATA FIELDS: name; email; initial; username.
- **PROOF PASS:** Pass (step 1): account-menu-desktop-light-signed-in.png,
  account-menu-desktop-dark-signed-in.png (the sidebar trigger; it opens to the right) and
  the signed-in public shots (the avatar trigger).
- **NOTES:**
  - Code: `src/components/layout/AccountMenu.tsx`.
  - Each console page is listed once: the menu had a "Dashboard" item that opened My
    Templates too, removed on 2026-09-29.

### Context switcher

- **SCREEN NAME:** Context switcher ("Switch context")
- **PURPOSE:** Show and change the active Ownership Context.
- **HOW USER GETS HERE:** the sidebar header's button on console pages (in the sidebar sheet
  below `md`).
- **WHAT'S ON THE SCREEN:** trigger: an icon, the active context's name ("Loading..." while
  unconfirmed, "Organizations unavailable" on error), a chevron. Menu: "Personal and
  Organizations"; one item per context (icon, name, "Personal" or the role, a check on the
  active one); when the Organizations failed, "Couldn't load your Organizations" and "Retry
  loading Organizations"; "Settings".
- **PRIMARY ACTION:** pick a context.
- **SECONDARY ACTIONS:** "Retry loading Organizations"; "Settings".
- **STATES:** loading (items disabled); error (Personal stays available); Organizations
  unavailable while in Personal.
- **NAVIGATION TYPE:** dropdown menu; on a console page, picking a context opens the same
  section in it (a Template or Run page opens that context's list, and an unsaved page asks
  first); on the public template page it changes in place.
- **PATTERN CHOICE (decided):** a shadcn DropdownMenu in the sidebar header ([Signed-in
  console shell](#signed-in-console-shell)).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: trigger (an icon tile, the context's name, a chevron); label; context items;
    notice; retry item; separator; link.
  - COMPONENT TYPES: sidebar menu button as the dropdown trigger; menu label; checkable
    items; link item.
  - DATA FIELDS: contexts (id, name, Personal or Organization, role); active id; status.
- **PROOF PASS:** Pass (step 1): the console shots; it follows the team switcher of shadcn's
  sidebar block (no reference screenshot).
- **NOTES:** A switch opens the chosen context's URL, which reloads the page's lists and becomes
  the remembered context.
  "Settings" opens the current context's settings. Code: `src/components/workspace/WorkspaceSwitcher.tsx`
  and `src/contexts/useContextSwitch.ts`.

### Start a Run dialog

- **SCREEN NAME:** Start a Run dialog ("Start a Run")
- **PURPOSE:** Name a new Run of a Template: the one way to start a Run.
- **HOW USER GETS HERE:** "Start Run" on a My Templates card (hover bar or actions menu) or
  list row, on Template detail, and on the public template page (signed in or not).
- **WHAT'S ON THE SCREEN:** "Start a Run"; "Run name", a labelled field whose placeholder is
  the default name ("<template title> - <date and time>"); "Cancel", "Start Run"; the close
  button.
- **PRIMARY ACTION:** "Start Run" → [Run page](#run-page) (toast "Checklist run created", or
  "Run started in <Organization>" for another Organization's Template on Template detail). For
  a visitor who is not signed in, on the public template page, it starts a guest run in the
  browser instead → [Guest run](#guest-run) (toast "Checklist run created").
- **SECONDARY ACTIONS:** "Cancel", Escape or the close button.
- **STATES:** "Starting…" (the field, both buttons and the Close button disabled, and Escape or a
  click outside does not close it); a blank name gets the default;
  a plan limit starts checkout (on My Templates the dialog stays busy until the browser leaves);
  an ended session goes to Log in; a failure keeps the dialog open with the typed name; the
  rest of the double click that opened it neither closes it nor starts a second Run.
- **NAVIGATION TYPE:** modal dialog.
- **PATTERN CHOICE (decided):** a shadcn Dialog with one labelled Field, the same on every page
  (the user's decision of 2026-09-29).
- **REFERENCE IMAGES:** none (the reference has no dialogs).
- **STRUCTURE (built):**
  - LAYOUT ZONES: header (title, close button); one labelled field; footer (two buttons,
    stacked on phones).
  - COMPONENT TYPES: label; input; outline and primary buttons.
  - DATA FIELDS: run name; default name (from the Template's title).
- **PROOF PASS:** Pass, against shadcn's Dialog (no reference screenshot):
  `tmp/design-review/decisions/start-run-dialog-public-template-desktop-signed-in.png`,
  `start-run-dialog-public-template-mobile-signed-in.png`,
  `start-run-dialog-my-templates-desktop-signed-in.png` and
  `start-run-dialog-my-templates-mobile-signed-in.png`: title, labelled field, footer buttons.
- **NOTES:**
  - Code: `src/components/ui/run-name-dialog.tsx`.
  - Until 2026-09-29, My Templates had its own "Start Run" dialog with a Template select and
    unlabelled fields, Template detail asked "Name Your Checklist Run" with "Start Checklist",
    and the public template page started a Run with the default name without asking. My
    Templates' dialog has no Template select now: the card's Start Run picks the Template.

### Share link dialog

- **SCREEN NAME:** Share link dialog ("Share run", "Share Template")
- **PURPOSE:** Show a created link with a copy button, so the link is never lost.
- **HOW USER GETS HERE:** "Share" on the Run page; "Share Run" in My Runs' "Run options";
  "Share" on Template detail.
- **WHAT'S ON THE SCREEN:** the title; the description ("Anyone with this link can open this
  Run without signing in, tick its tasks, add notes and complete it." or "Share this template
  with others. They can view it and copy it into their library."); a read-only link field
  labelled "Share link", with its copy button ("Copy share link") inside it; "Close"; the
  close button.
- **PRIMARY ACTION:** copy the link.
- **SECONDARY ACTIONS:** "Close".
- **STATES:** copied (toast "Share link copied", "Share link copied to clipboard" or "Public
  link copied"); copy refused (toast "Couldn't copy the link. Select it and copy it
  manually.").
- **NAVIGATION TYPE:** modal dialog.
- **PATTERN CHOICE (built):** shadcn Dialog with a labelled copy InputGroup
  (`ShareLinkDialog`).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: header (title, description, close button); the labelled link field; footer.
  - COMPONENT TYPES: label; read-only InputGroup with an icon button; outline button.
  - DATA FIELDS: title; description; URL.
- **PROOF PASS:** Pass (step 2a), against shadcn's Dialog: `template-detail-share-dialog` and
  `run-share-dialog`, each on desktop and phone, light and dark. The field fits a 390px
  screen (the link scrolls inside it) and the copy button stays in reach.
- **NOTES:** While a Run is shared, Share on the same page shows its link again; a new share
  mints a new link and ends the old one.

### Transfer to Organization dialog

- **SCREEN NAME:** Transfer to Organization dialog ("Transfer to Organization")
- **PURPOSE:** Move one of the user's Personal Templates into an Organization, in place.
- **HOW USER GETS HERE:** "Transfer to Organization" in Template detail's "Template actions",
  on a Personal Template the user owns, when they are an active owner, admin or editor of an
  Organization.
- **WHAT'S ON THE SCREEN:** the title; "Move "<title>" out of Personal and into an
  Organization, where its members can use it."; an "Organization" select of the Organizations
  where the user can add Templates (the first one chosen); "Runs you already started from it
  stay in Personal and no longer receive its changes."; for a public Template, "Its public page
  moves to the Organization's profile, and its current link redirects there."; "Cancel",
  "Transfer"; the close button.
- **PRIMARY ACTION:** "Transfer": the Template moves to the Organization (toast "Template
  transferred to <Organization>") and the page opens it at that Organization's URL.
- **SECONDARY ACTIONS:** "Cancel", Escape or the close button.
- **STATES:** "Transferring..." with the buttons disabled, and Escape or a click outside does
  not close it then; a refusal (the Organization's Template limit, a Template changed
  meanwhile, which also reloads it, or a public Template sent to an Organization without a
  slug) shows a toast and keeps the dialog open.
- **NAVIGATION TYPE:** modal dialog.
- **PATTERN CHOICE (built):** shadcn Dialog with a labelled Select (`LabeledSelect`), as the
  Start a Run dialog.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: header (title, description, close button); the select; the Runs note;
    footer (two buttons).
  - COMPONENT TYPES: heading; paragraph; labelled select; muted paragraph; outline and primary
    buttons.
  - DATA FIELDS: Template title and visibility; the Organizations (name, role, membership).
- **PROOF PASS:** not yet run (step 2a); `template-transfer.spec.ts` checks it fits a 390px
  screen.
- **NOTES:** Code: `src/components/template/TransferTemplateDialog.tsx`,
  `src/features/template-detail/useTemplateTransfer.ts`. API: `POST
  /api/templates/:id/transfer` ([Organizations](organizations.md)).

### Run complete dialog

- **SCREEN NAME:** Run complete dialog ("Complete this Run?")
- **PURPOSE:** Confirm completing a Run whose tasks are all done.
- **HOW USER GETS HERE:** ticking the last open task; "Complete run"; "Finish Run". On the Run
  page, on a shared run and on a guest run.
- **WHAT'S ON THE SCREEN:** "Complete this Run?", "Every task is done. Completing the Run
  freezes its tasks: they can no longer be ticked or unticked."; "Not yet" (outline), "Complete
  Run" (primary); the close button.
- **PRIMARY ACTION:** "Complete Run": completes the Run (toast "Run completed"); a signed-in
  owner or member then goes to [My Runs](#my-runs), a guest on a share link stays on the
  [Shared run](#shared-run), and a visitor on a [Guest run](#guest-run) stays on it; both now
  read "Completed".
- **SECONDARY ACTIONS:** "Not yet", Escape or the close button: the Run stays in progress and
  the page keeps offering "Complete run".
- **STATES:** both buttons and the Close button wait while the completion saves, and Escape or a
  click outside does not close it then; a save failure shows a toast and
  keeps the dialog; the rest of the double click that opened it neither closes it nor
  completes the Run.
- **NAVIGATION TYPE:** modal dialog.
- **PATTERN CHOICE (decided):** a shadcn Dialog with a confirm and a cancel button, in theme
  colors (the user's decision of 2026-09-29).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: header (title, description, close button); footer (two buttons).
  - COMPONENT TYPES: heading; muted paragraph; outline and primary buttons.
  - DATA FIELDS: none.
- **PROOF PASS:** Pass, against shadcn's Dialog (no reference screenshot):
  `tmp/design-review/decisions/run-complete-dialog-desktop-signed-in.png`,
  `run-complete-dialog-mobile-signed-in.png` and
  `shared-run-complete-dialog-desktop-guest.png`.
- **NOTES:** Code: `src/components/run-execution/RunCompleteDialog.tsx`. Until 2026-09-29 it
  read "Checklist Completed!" with one button, "Return to Dashboard" or "Return to Public Runs",
  that completed the Run; there is no Public Runs page.

### Delete confirmations

- **SCREEN NAME:** Delete confirmations ("Delete template", "Delete run")
- **PURPOSE:** Confirm a delete. The item moves to [Archive](#archive), where it can be
  restored.
- **HOW USER GETS HERE:** "Delete" on a My Templates card menu or list row; "Delete" in
  Template detail's "Template actions"; "Delete" in My Runs' "Run options"; "Delete run" on a
  [Guest run](#guest-run).
- **WHAT'S ON THE SCREEN:** "Delete template" with "Are you sure you want to delete this
  template?" (My Templates) or "Are you sure you want to delete "<title>"?" (Template detail);
  "Delete run" with "Are you sure you want to delete this run?"; "Cancel", "Delete".
- **PRIMARY ACTION:** "Delete" (toast "Template deleted" or "Run deleted"; Template detail
  returns to My Templates, and a Guest run to its public template page). A guest run is removed
  from the browser, not archived: it has no Archive entry.
- **SECONDARY ACTIONS:** "Cancel".
- **STATES:** "Deleting..."; a failure toast; an item deleted elsewhere closes the dialog and
  reloads the list.
- **NAVIGATION TYPE:** alert dialog (it does not close on a click outside).
- **PATTERN CHOICE (built):** shadcn AlertDialog for all three, with a destructive action
  (`ConfirmDialog`).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: header (title, question); footer (two buttons, stacked on phones).
  - COMPONENT TYPES: heading; paragraph; outline and destructive buttons.
  - DATA FIELDS: item kind; title (Template detail).
- **PROOF PASS:** Pass (step 2a), against shadcn's AlertDialog: `my-templates-delete-dialog`,
  `template-detail-delete-dialog` and `my-runs-delete-dialog`, each on desktop and phone,
  light and dark.
- **NOTES:** The API archives the item. The UI says Delete and never says it cannot be undone.

### Action menus

- **SCREEN NAME:** Action menus
- **PURPOSE:** Per-item actions that do not fit on a card or row.
- **HOW USER GETS HERE:** "Actions for <title>" on a My Templates card; "Template actions" on
  Template detail; "Run options" on a My Runs row; "More actions" in the editor header.
- **WHAT'S ON THE SCREEN:**
  - Template card: "Edit", "Start Run", "Duplicate", "Delete" (by role).
  - Template detail: "Duplicate" ("Duplicating..."), "Export JSON" or "Upgrade to export",
    "Transfer to Organization" (the owner of a Personal Template who can add Templates to an
    Organization), "Delete".
  - Run row: "Share Run", "Stop sharing" (a shared Run), "Delete" (by role).
  - Editor: "Preview" (phones), "Discard changes".
- **PRIMARY ACTION:** the first item.
- **SECONDARY ACTIONS:** the rest.
- **STATES:** role-limited items; disabled while an action runs.
- **NAVIGATION TYPE:** dropdown menu.
- **PATTERN CHOICE (built):** shadcn DropdownMenu, the destructive item last after a
  separator.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: icon trigger; item list; separator; destructive item.
  - COMPONENT TYPES: icon button; menu items with icons; destructive item.
  - DATA FIELDS: item; permissions; plan state (export).
- **PROOF PASS:** Pass (step 2a), against shadcn's DropdownMenu: `my-templates-card-menu`,
  `template-detail-actions-menu` and `my-runs-options-menu`, each on desktop and phone, light
  and dark.
- **NOTES:** On a card the trigger shows on hover, keyboard focus and touch screens.

### Template preview dialog

- **SCREEN NAME:** Template preview dialog
- **PURPOSE:** Show the draft as it will read, without saving.
- **HOW USER GETS HERE:** "Preview" in the editor header.
- **WHAT'S ON THE SCREEN:** "Template preview", "This preview reflects the current draft.
  Saving is not required."; the draft's title (or "Untitled Template") and description; its
  "Required tools" (the tools that have a name, trimmed, as the public template page lists
  them, under an `h3`); its sections with every task open.
- **PRIMARY ACTION:** close.
- **SECONDARY ACTIONS:** none.
- **STATES:** follows the draft as typed.
- **NAVIGATION TYPE:** modal dialog (large; its header stays while the draft scrolls).
- **PATTERN CHOICE (built):** shadcn Dialog; the draft keeps its own renderer
  (`PublicTemplateContent`, every task open). Reusing the public template page's "What's
  included" block (`TemplateSectionList`) is left for later: that renderer's tested
  behaviors (Clipy images and player, file and embed links) would move with it.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: header (title, description, close button); a scrolling body (the draft's
    title and description, its Required tools when it has any, then its sections).
  - COMPONENT TYPES: heading; paragraph; section and task list with disclosure.
  - DATA FIELDS: draft title, description, Required tools, sections.
- **PROOF PASS:** Pass (step 2a), against shadcn's Dialog: `editor-preview-dialog`, on
  desktop and phone, light and dark. It fits a 390px screen (85% of the window's height).
- **NOTES:** none.

### Add Block popover

- **SCREEN NAME:** Add Block popover
- **PURPOSE:** Add a content block to a task.
- **HOW USER GETS HERE:** "Add Block" in the Content Blocks header, or in the "No content
  blocks yet" box.
- **WHAT'S ON THE SCREEN:** "Text", "Image", "Video", "File", "Embed", "Sub-tasks".
- **PRIMARY ACTION:** pick a block type.
- **SECONDARY ACTIONS:** Escape or a click outside to close.
- **STATES:** open or closed.
- **NAVIGATION TYPE:** dropdown menu.
- **PATTERN CHOICE (built):** shadcn DropdownMenu (`ContentAddPanel`): its items are menu
  items, reached with the arrow keys.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: trigger; a floating menu.
  - COMPONENT TYPES: outline button; menu items with icons.
  - DATA FIELDS: block type (icon, label).
- **PROOF PASS:** Pass (step 2a), against shadcn's DropdownMenu: `editor-add-block-menu`, on
  desktop and phone, light and dark.
- **NOTES:** Until step 2a it was a hand-built positioned list of buttons.

### Run tasks sheet

- **SCREEN NAME:** Run tasks sheet ("Tasks")
- **PURPOSE:** Open any task of the Run on narrower screens.
- **HOW USER GETS HERE:** "Tasks" in the progress block of the Run page or the Guest run, below
  `xl`.
- **WHAT'S ON THE SCREEN:** a sheet from the bottom: "Tasks", "Open any task in this run.";
  the task list by section ("Run tasks"), the current task marked.
- **PRIMARY ACTION:** pick a task (the sheet closes).
- **SECONDARY ACTIONS:** close.
- **STATES:** focus starts on the current task and returns to "Tasks" on close; the sheet
  closes when the window grows to `xl`, where the task column shows.
- **NAVIGATION TYPE:** sheet.
- **PATTERN CHOICE (built):** shadcn Sheet holding the same list as the `xl` column.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: header (title, description, close button); scrolling list; "Overall
    Progress" at the foot.
  - COMPONENT TYPES: Sheet; grouped task list with a current marker; progress bar.
  - DATA FIELDS: sections; tasks (title, done, current); progress.
- **PROOF PASS:** Pass (step 2a), against shadcn's Sheet: `run-tasks-sheet-mobile-light` and
  `-dark`.
- **NOTES:** none.

### Revoke Run Key dialog

- **SCREEN NAME:** Revoke Run Key dialog ("Revoke <name>?")
- **PURPOSE:** Confirm revoking a Run Key.
- **HOW USER GETS HERE:** "Revoke" on an active key in Account Settings' Agent Access.
- **WHAT'S ON THE SCREEN:** "Revoke <name>?", "The agent will immediately lose access. This
  action cannot be undone, but its run history will be preserved."; "Cancel", "Revoke key".
- **PRIMARY ACTION:** "Revoke key" (toast "Run Key revoked").
- **SECONDARY ACTIONS:** "Cancel".
- **STATES:** "Revoking..." on the row's button; a failure toast ("Failed to revoke Run Key").
- **NAVIGATION TYPE:** modal dialog (alert dialog).
- **PATTERN CHOICE (built):** shadcn AlertDialog with a destructive action
  (`ConfirmDialog`).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (built):**
  - LAYOUT ZONES: header; footer (stacked on phones).
  - COMPONENT TYPES: heading; paragraph; cancel and destructive buttons.
  - DATA FIELDS: key name.
- **PROOF PASS:** Pass (step 2a), against shadcn's AlertDialog: `settings-revoke-key-dialog`,
  on desktop and phone, light and dark.
- **NOTES:** none.

### Browser confirm prompts

- **SCREEN NAME:** Browser confirm prompts
- **PURPOSE:** Ask before losing work or access.
- **HOW USER GETS HERE:**
  - Unsaved changes in the Template editor (form edits, a file still uploading, a save in
    flight) or on the Run page and the Guest run (unsaved task notes): on an in-app link, Back
    or Forward, and "Sign out"; the browser's own leave prompt on a reload or tab close.
  - In the editor: "Load latest version" with unsaved edits; a Clipy draft or "Restore draft"
    replacing unsaved work.
  - In Organization Settings: "Leave <name>? You will lose access to its Templates and Runs." and
    "Transfer Organization ownership to <name>? You will become an admin."
- **WHAT'S ON THE SCREEN:** the browser's confirm box with the message, OK and Cancel.
- **PRIMARY ACTION:** OK.
- **SECONDARY ACTIONS:** Cancel.
- **STATES:** none.
- **NAVIGATION TYPE:** browser confirm.
- **PATTERN CHOICE (proposal):** shadcn AlertDialog for the in-app prompts; the reload and
  tab-close prompt must stay the browser's.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):** a native dialog.
- **PROOF PASS:** Not restyled: step 2a kept the browser's prompts, since the editor's and
  the run page's unsaved-changes guards stay as they are.
- **NOTES:** TBD whether the Back and Forward guard can wait for an in-page dialog.

## Decided on 2026-09-29

The user answered the questions step 1 raised. The cards above describe the result.

- Header dropdowns: yes. "Templates" (Template Library, Categories) and "Features" (the four
  feature pages) are NavigationMenu dropdowns, the phone sheet groups them, and "Pricing" stays
  a link ([Public shell](#public-shell), [Public menu sheet](#public-menu-sheet)).
- "Updated <date>" on the [public template page](#public-template-page): yes.
- Icon tiles stay neutral: no change.
- The phone context switcher stays in the sidebar sheet: no change.
- One Run URL: `/dashboard/runs/<id>/`; `/run/<id>` redirects there ([Run page](#run-page)).
- A sign-in with no return path opens the console home, [My Templates](#my-templates).
- The [account menu](#account-menu) drops "Dashboard" and keeps "My Templates".
- One name, the Template Library, for `/templates/` ([Template Library](#template-library)).
- One [Start a Run dialog](#start-a-run-dialog) everywhere a Run starts.
- An honest [Run complete dialog](#run-complete-dialog): "Complete Run" and "Not yet".
- The [shared run](#shared-run) page, Home and the Share run dialog say what guests can do.
- The [404 page](#404-page) under `/dashboard/`: the console shell for a signed-in user, the
  public shell for anyone else.
- `/categories/` is linked from the header's Templates menu and the footer.
- [Categories](#categories) says when a search matches nothing, with "Clear search".
- The Template editor's phone layout, like every other screen's, is step 2 of the restyle.
- My Templates counts in the singular and shows no count until its list loads.

## Open questions

Found while making those changes; none is decided here.

- "Library" still names a user's own Templates in places: "N templates in your library" (My
  Templates), "Copy to Library" and "save it to your library" (the public template page), "copy
  it into their library" (the Share Template dialog), "bootstrap your template library" (Import
  Templates). Next to the Template Library, "Copy to Library" can read as publishing.
- The header's "Features" menu lists the four feature pages, not the `/features/` overview,
  which Home's "Explore Features" and a feature page's breadcrumb still reach. Add an
  overview item?
- Pricing's Free plan lists "Browse public checklists" (the Template Library under another
  name); pricing wording was left as it is.
- The Start a Run toast says "Checklist run created" (or "Run started in <Organization>"), and
  "Starting…" uses an ellipsis character where other buttons say "Saving..." or "Creating...".
- The site header's "Templates" menu is the public library and Categories, while the console
  sidebar's "Templates" is My Templates.

Raised by step 2a (the signed-in console), none decided:

- Labels the restyle made visible, so that every field has one: "Search", "Visibility" and
  "Sort by" (My Templates), "Search" and "Status" (My Runs), "Run title" (renaming a Run),
  "Share link" (the Share link dialog), "Public Clipy video link" (the editor), and "Role" and
  "Status" on a member's selects on phones. The avatar's "Upload avatar" and "Remove avatar"
  were hover-only icon buttons with those names; they are now visible buttons. Keep this
  wording?
- New wording for the editor on phones: "Outline" (the header button and the sheet's title),
  and "Move <entry> up" and "Move <entry> down" on a touch screen.
- Account Settings' card proposed a section nav or Tabs; step 2a kept one column of Cards.
  Add one?
- The Template preview dialog keeps its own renderer instead of the public page's "What's
  included" block, which its card proposed. Move it over (with its tests)?
- The delete confirmations are alert dialogs now, so a click outside no longer closes them
  (Cancel or Escape does).
- On phones the editor's Preview moves into "More actions" and its theme toggle leaves the
  top bar (the sidebar keeps one), and the run page's Previous and Next show only their
  arrows.

Raised by step 2b (the public and sign-in pages), none decided:

- Labels the restyle made visible: "Search categories" (Categories; it was the field's
  hidden name), "Search templates" (the Template Library, whose search had no name at all),
  and "Search" and "Sort by" (a category page, as on My Templates). Keep this wording?
- A feature page's breadcrumb says "Features" where its back link said "Back to Features"
  (the same destination, as the template page's "Template Library" replaced "Back"); a
  category page's breadcrumb keeps the back link's "All Categories".
- The sign-in pages keep "Built for repeatable work" beside the form from `lg` (hidden on
  phones, as before), in the muted column of shadcn's two-column login block. Keep it, or use
  the block's single card?
- A Public Profile's cards are `MediaCard`s with the profile's own words ("N items",
  "@username", its fallback description) rather than the library's card ("N tasks", "Start",
  the owner). Use the library's card there?
- Muted text on a muted panel (the sign-in aside, the stats panel, the call-to-action banner)
  is the shadcn neutral theme's own pair, about 4.3:1 in the light theme, under WCAG AA's
  4.5:1 for small text. Keep the theme's tokens there?
- The Organization invite's buttons stack across the card in every state, as the sign-in
  forms' buttons do, where they sat side by side.
