# UI screen inventory

Phases 2 and 3 of the UI runbook for the web app: a spec card for every screen and overlay in
the [UI app map](ui-app-map.md), with its structure extraction. The design reference is
https://aiuxplayground.com/. Its screenshots are named by file below (for example
home-1.png): 1440×900 slices of the site and one 390px phone shot (home-mobile.png). They
are kept outside the repository.

Step 1 restyled the public shell, the signed-in shell, Home, the Template Library and the
public template page with the shared blocks (listed in
[DESIGN.md](../DESIGN.md#shells-and-layout-blocks)); step 2 restyles the rest.

## How to read a card

- The fields follow the runbook's template: SCREEN NAME, PURPOSE, HOW USER GETS HERE, WHAT'S
  ON THE SCREEN, PRIMARY ACTION, SECONDARY ACTIONS, STATES, NAVIGATION TYPE, PATTERN CHOICE,
  REFERENCE IMAGES, STRUCTURE, PROOF PASS, NOTES. Its PLATFORM NOTE is left out: this is a
  web app. Navigation types are defined in the [app map](ui-app-map.md#navigation-types).
- WHAT'S ON THE SCREEN and STATES describe the code today. Quoted words are the labels the
  app shows.
- PATTERN CHOICE names a [reference pattern](#reference-patterns). It is decided on a step 1
  card and a proposal on a step 2 card.
- STRUCTURE (phase 3) lists layout zones, component types and data fields. On a step 1 card
  it is what step 1 built; on a step 2 card it is the structure the code has today.
- PROOF PASS is the runbook's phase 5 check against the reference images: structural
  differences only (layout zones, component types, hierarchy, missing sections), not color
  or imagery. A step 1 card gives the result and the screenshots it was checked on. They
  are saved locally in `tmp/design-review/step1/` (git ignores it) as
  `<screen>-<desktop|mobile>-<light|dark>-<signed-in|signed-out>.png`: full pages at
  1440x900 and 390x844. A step 2 card reads "Not restyled yet (step 2)".

## Reference patterns

Structure only, from the screenshots: no color, brand or imagery. USED BY names the app
screens that follow the pattern (decided for step 1, proposed for step 2).

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
  [Contact](#contact), [404 page](#404-page) (proposed).

### Category tiles

- **SCREENSHOTS:** home-1.png, home-mobile.png.
- **LAYOUT ZONES:** one row of 8 equal tiles on desktop; 2 columns of 4 rows on a phone.
- **COMPONENT TYPES:** bordered rounded tile, a link: a small tinted round icon tile at the
  top left, the name at the bottom left, the count at the bottom right.
- **DATA FIELDS:** icon; name; item count.
- **USED BY:** [Template Library](#template-library) "Browse by Category" (decided, 4
  columns); [Categories](#categories) "Popular Categories" (proposed).

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
  Library](#template-library) cards (decided); [Features](#features), [About](#about),
  [Public Profile](#public-profile), [My Templates](#my-templates) (proposed).

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
- **USED BY:** [Home](#home) product surfaces (decided); [Categories](#categories) "All
  Categories", [Contact](#contact), [Archive](#archive), [Shared run](#shared-run) sections
  (proposed).

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
  hero); [Category page](#category-page), [My Templates](#my-templates) (proposed).

### List rows with thumbnail

- **SCREENSHOTS:** teardowns-3.png, teardowns-4.png, patterns-3.png, home-4.png to home-7.png
  ("Recently published").
- **LAYOUT ZONES:** a group heading ("International products", "More in Trust"), then rows
  separated by dividers.
- **COMPONENT TYPES:** row = a rounded thumbnail on the left (about 176×110 in teardowns,
  320×200 in patterns), a text column, a trailing chevron.
- **DATA FIELDS:** thumbnail; meta line (product icon and name, a category, or "Skill · Sep
  17"); title; muted meta ("12 screens · June 16, 2026") or a 2-line description.
- **USED BY:** [My Runs](#my-runs) rows, [Category page](#category-page) list view
  (proposed).

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
- **USED BY:** [Public template page](#public-template-page) (decided); [Feature
  page](#feature-page), [Template detail](#template-detail), [Category page](#category-page)
  header, [Public Profile](#public-profile) header, [Shared run](#shared-run) (proposed).

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
- **USED BY:** [Account Settings](#account-settings) section nav, [Template
  editor](#template-editor) outline, [Run page](#run-page) task list (proposed).

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
  [Categories](#categories) closing card, [Shared run](#shared-run) closing card (proposed).

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
  on the public template page since 2026-09-29.
- The reference's tinted icon tiles: icon tiles use the neutral muted token (no custom
  colors).

## Shared shells and frames

### Public shell

- **SCREEN NAME:** Public shell (site header and site footer)
- **PURPOSE:** Frame every public page: brand, main navigation, sign-in actions, footer
  links.
- **HOW USER GETS HERE:** any page in the `(site)` route group, and the 404 page on public
  paths.
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
    like operations."; columns "Templates" ("Template Library", "Categories"), "Company"
    ("About") and "Support" ("Contact").
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
  - Base UI's navigation menu keeps an empty "navigation" landmark (its popup) at the end of
    the page while a menu is open; the menu's links are read inside the header's "Site"
    navigation.
  - The footer's empty "Network" column is left out.

### Signed-in console shell

- **SCREEN NAME:** Signed-in console shell
- **PURPOSE:** Frame every console page: move between console sections, see and switch the
  Ownership Context, reach the account.
- **HOW USER GETS HERE:** any page under `/dashboard/`, after the session check.
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
  - Organizations failed to load before the stored Organization was confirmed: "Couldn't load
    your Organizations", "Your Organization opens once they load. Check your connection and
    try again, or continue in Personal.", "Retry", "Continue in Personal" (in place of the
    page).
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
  - A top bar in the inset holds the sidebar trigger, and from `md` up the site links the
    console header had. On phones the sidebar opens as its own sheet and the bottom bar goes
    away. The site footer stays under console pages.
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
  - A Run's page (`/dashboard/runs/<id>/`) highlights "Runs".
  - The public site header no longer sits above console pages: the sidebar holds the brand,
    the switcher, the theme toggle and the account menu, and the top bar the site links.
  - The collapsed state lasts until a full page load: reading shadcn's cookie on the server
    would render every console page per request.
  - The rows are 44px tall, the old sidebar's full-size targets
    (`tests/e2e/template-editor-bugs.spec.ts`), where shadcn's are 32px; collapsed to icons
    they are shadcn's 32px squares.

### Auth card frame

- **SCREEN NAME:** Auth card frame
- **PURPOSE:** The shared frame of [Log in](#log-in), [Register](#register), [Forgot
  password](#forgot-password) and [Reset password](#reset-password).
- **HOW USER GETS HERE:** through those four pages.
- **WHAT'S ON THE SCREEN:** a wide bordered card, centered in the window. Left: an icon
  badge, the "SERP Lists" eyebrow, the page title, a description, the form, a footer line
  with a link. Right, from `lg` up: an aside with "Built for repeatable work", "Create the
  template once. Run it cleanly every time.", a paragraph, and 3 check-marked points.
- **PRIMARY ACTION:** the form's submit button.
- **SECONDARY ACTIONS:** the footer link.
- **STATES:** set by each page.
- **NAVIGATION TYPE:** frame for child pages.
- **PATTERN CHOICE (proposal):** centered card form: a single bordered card with the heading,
  description and fields (shadcn's login block). TBD whether the aside stays.
- **REFERENCE IMAGES:** none (the reference has no auth pages); type scale from home-1.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: a centered card, two columns at `lg` (form, aside).
  - COMPONENT TYPES: icon badge; eyebrow; heading; muted paragraph; labeled inputs (some with
    a leading icon or a show/hide button); full-width primary button; footer link; check list.
  - DATA FIELDS: title; description; footer text and link; aside title, text and points.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/components/auth/AuthPageShell.tsx`.

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
  needs the public catalog, which Home must not load
  (`tests/unit/contexts/catalogConsumers.test.ts`, [D1 cost](d1-cost.md)).
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
    the community", the search input "Search templates...", and the category chips: "All" and
    one per category (a category chip links to its category page).
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

### Public template page

- **SCREEN NAME:** Public template page (`/profile/<user>/<template>/`)
- **PURPOSE:** Show one Public Template and let the visitor start a Run or save a copy.
- **HOW USER GETS HERE:** a template card (library, category page, Public Profile, Home); a
  shared link (this is the Template's only public URL); the "Share Template" dialog's link.
- **WHAT'S ON THE SCREEN:**
  - A breadcrumb: Home (an icon) › "Template Library" › the Template's title.
  - Signed in, when the Organizations failed to load: "Couldn't load your Organizations",
    "Start Run and Save wait until they load. Check your connection and try again, or continue
    in Personal.", "Retry", "Continue in Personal".
  - The header: an icon tile by template type, the title, the description, the owner's
    avatar and name (a link to the Public Profile), "Updated <date>" (the Template's last
    update in the viewer's date format, as template detail's "Last updated"; left out when
    unreadable), the category badges (links to category pages; plain for a category with no
    page), and "Share" (outline), "Save" (outline) and "Start Run" (primary).
  - Beside it (below it on phones), a panel: "Sections", "Tasks", "Type" (checklist or
    recipe).
  - "What's included": one collapsible card per section (number, title, "N tasks",
    chevron). Open, it lists numbered tasks with their title, description and content
    blocks, read-only.
  - Tags ("#tag").
  - "Ready to use this template?": text that says what the viewer's role allows; "Copy to
    Library" (outline) and "Start Run" (primary).
- **PRIMARY ACTION:** "Start Run" → [Run page](#run-page). Signed out → [Log in](#log-in),
  then back.
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
  - Start Run: "Starting..."; disabled while the context loads.
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
    - Body: "What's included" (section cards), a tags row, the call-to-action card.
  - COMPONENT TYPES: breadcrumb; icon tile; heading; muted paragraph; chip link; avatar with a
    name link; outline and primary buttons; stats panel (3 rows: icon, value, label);
    collapsible card (a header row with a number badge, title, count and chevron); task row
    (number, title, description, content blocks); tag list; call-to-action card (title, text,
    two buttons); alert.
  - DATA FIELDS: title; description; type; categories (name, category URL); owner (name,
    initial, Public Profile URL); last update (`updatedAt`, else `createdAt`); section count; task count; sections (title, task count;
    tasks with title, description, content blocks); tags; Save and Start Run labels; the
    role-aware call-to-action text.
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

### Categories

- **SCREEN NAME:** Categories ("Browse Categories", `/categories/`)
- **PURPOSE:** List the template categories with their counts.
- **HOW USER GETS HERE:** "Categories" in the header's "Templates" menu, the phone menu
  sheet and the footer's "Templates" column; "All Categories" on a category page; the console
  sidebar's "Categories".
- **WHAT'S ON THE SCREEN:** title "Browse Categories" and "Explore templates organized by
  category to find exactly what you need."; search "Search categories..."; "Popular
  Categories": 4 tiles (colored icon tile, name, "N templates"); "All Categories": rows (icon
  tile, name, description, a "N templates" badge, chevron); a closing card "Can't find what
  you're looking for?", "Create your own template from scratch and share it with the
  community.", "Create Template" (→ `/dashboard/templates/new/`).
- **PRIMARY ACTION:** a category → [Category page](#category-page).
- **SECONDARY ACTIONS:** search; "Create Template".
- **STATES:** loading (4 tile and 6 row skeletons, "Loading categories…" for screen readers);
  catalog error ("Could not load templates", "Try again") in place of both lists; a search with
  no match shows an empty list with no message.
- **NAVIGATION TYPE:** child page.
- **PATTERN CHOICE (proposal):** [Page hero](#page-hero) with the search input; [Category
  tiles](#category-tiles) for "Popular Categories"; [Bordered list
  cards](#bordered-list-cards) with chevrons for "All Categories"; [Call-to-action
  banner](#call-to-action-banner) for the closing card.
- **REFERENCE IMAGES:** prompts-1.png, home-1.png, prompts-2.png, prompts-3.png, home-7.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: a left-aligned header (title, description); search; tile grid (2 columns, 4
    at `lg`); row list; closing card.
  - COMPONENT TYPES: search input; tile card; list row card with a badge and chevron;
    call-to-action card.
  - DATA FIELDS: category (icon, name, description, template count).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/Categories.tsx`. "Create Template" sends a signed-out visitor to
  Log in. Built-in categories have descriptions; others read "Community templates for this
  workflow area".

### Category page

- **SCREEN NAME:** Category page (`/categories/<slug>/`)
- **PURPOSE:** List the Public Templates in one category.
- **HOW USER GETS HERE:** a library category chip or "Browse by Category" tile; a Categories
  tile or row; a category chip on a template page; "Related Categories";
  `/templates/?category=<slug>`.
- **WHAT'S ON THE SCREEN:** "All Categories" (back link); header: colored icon tile, the
  name, the description, a "N templates" badge; toolbar: search "Search templates...", sort
  select ("Most Popular", "Most Recent", "Trending", "Name A-Z"), grid and list buttons ("Show
  templates in grid view", "Show templates in list view"); template cards (the library card,
  laid out horizontally in list view); "Related Categories": up to 5 outline chips.
- **PRIMARY ACTION:** a template card → [Public template page](#public-template-page).
- **SECONDARY ACTIONS:** search; sort; grid or list; a related category; "All Categories".
- **STATES:** loading (header and 6 card skeletons); catalog error; empty: "No public
  templates in this category yet." (noindex) or "No templates found matching your search.";
  an unknown category: the [404 page](#404-page) view (noindex, HTTP 200); an old slug
  replaces itself with the current one; grid or list (remembered per user).
- **NAVIGATION TYPE:** child page; push to the template page.
- **PATTERN CHOICE (proposal):** a [Detail page](#detail-page) header (breadcrumb Home ›
  Categories › name, icon tile, title, description, count) over a [Filterable
  grid](#filterable-grid) (search, sort, grid or list, 3-column template cards; list view as
  [List rows with thumbnail](#list-rows-with-thumbnail)); related categories as a chip row.
- **REFERENCE IMAGES:** pattern-detail-1.png, patterns-2.png, prompts-4.png,
  teardowns-3.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: back link; header (icon tile, title, description, count badge); toolbar
    (search, sort select, view toggle); grid or list; related chips.
  - COMPONENT TYPES: link; icon tile; badge; search input; select; toggle buttons; template
    card (vertical or horizontal); chip.
  - DATA FIELDS: category (name, icon, description, count); template card (as in the library).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/CategoryDetail.tsx`. Each category opens with an empty search
  and the default sort.

### Public Profile

- **SCREEN NAME:** Public Profile (`/profile/<user>/`)
- **PURPOSE:** Show a Profile Owner and their Public Templates.
- **HOW USER GETS HERE:** the owner link on a template card or template page; the account
  menu's "Profile" (a new tab); the "Public profile URL" link in Account Settings.
- **WHAT'S ON THE SCREEN:** avatar; name; "@username"; a summary; meta (location, website
  link, "Joined <month year>"); 3 stat cards ("Templates"; "Total Views" or "Checklist Items";
  "Total Runs" or "Categories"); "Public Templates" with "Browse every public template
  published from this profile."; 2-column template cards (title, "@username", an arrow icon,
  the description or "Public template pack published in this creator profile.", up to 3
  category chips, "N sections", "N items").
- **PRIMARY ACTION:** a template card → [Public template page](#public-template-page).
- **SECONDARY ACTIONS:** the website link (a new tab).
- **STATES:** loading ("Loading profile..."); error ("Unable to load profile", the message,
  "Try again"); not found ("User not found", "This profile does not exist.", noindex); no
  Templates ("No public templates", "@<user> has not published any public templates yet.");
  another letter case of the username replaces itself with the stored one.
- **NAVIGATION TYPE:** child page.
- **PATTERN CHOICE (proposal):** a [Detail page](#detail-page) header (the avatar in the icon
  tile's place, big title, handle, summary, meta row) with the stats as its right panel or
  facts strip; [Section row over a card grid](#section-row-over-a-card-grid) for "Public
  Templates", with the shared template card.
- **REFERENCE IMAGES:** pattern-detail-1.png, teardown-detail-1.png, home-2.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: profile header (avatar, text column); a row of 3 stat cards; section
    header; 2-column card grid.
  - COMPONENT TYPES: avatar; heading; meta items with icons; stat card; card link; chip.
  - DATA FIELDS: profile (name, username, avatar, summary, location, website, joined date,
    stats); Template (title, description, categories, section count, item count, URL).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/UserProfile.tsx`. Only Users have Public Profiles today;
  Organization Public Profiles do not exist yet.

### Features

- **SCREEN NAME:** Features (`/features/`)
- **PURPOSE:** Summarize what the product does.
- **HOW USER GETS HERE:** "Explore Features" on Home and About; "Back to Features" on a
  feature page. The header's "Features" menu lists the feature pages, not this overview, and
  shows as the current section here.
- **WHAT'S ON THE SCREEN:** hero: eyebrow "Features", title "Features that keep work
  consistent.", "Build checklists once, then run them repeatedly with confidence. SERP Lists
  focuses on clarity, repeatability, and simple sharing.", "See Pricing" (primary), "Browse the
  Template Library" (outline); 4 linked feature cards in 2 columns (icon, title, description,
  "View the feature details and related workflows."): "Template Builder", "Checklist Runs",
  "Public Sharing", "Import + Export".
- **PRIMARY ACTION:** a feature card → [Feature page](#feature-page).
- **SECONDARY ACTIONS:** "See Pricing"; "Browse the Template Library".
- **STATES:** static.
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (proposal):** [Page hero](#page-hero); [Section row over a card
  grid](#section-row-over-a-card-grid) (a muted top with the feature icon, then title and
  description).
- **REFERENCE IMAGES:** prompts-1.png, prompts-2.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: hero; a 2-column card grid.
  - COMPONENT TYPES: eyebrow; heading; paragraph; buttons; linked card (icon badge, title,
    description, footer text).
  - DATA FIELDS: feature (slug, icon, title, description).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/Features.tsx`; content in `src/data/publicFeatures.ts`.

### Feature page

- **SCREEN NAME:** Feature page (`/features/<slug>/`)
- **PURPOSE:** Describe one feature.
- **HOW USER GETS HERE:** the header's "Features" menu (and its group in the phone menu
  sheet); a card on Features. The slugs are `template-builder`, `checklist-runs`,
  `public-sharing` and `import-export`.
- **WHAT'S ON THE SCREEN:** "Back to Features" (ghost); a card: large icon badge, title,
  description, 3 bullets, "Browse the Template Library" (primary), "See Pricing" (outline).
- **PRIMARY ACTION:** "Browse the Template Library" → [Template Library](#template-library).
- **SECONDARY ACTIONS:** "See Pricing"; "Back to Features".
- **STATES:** an unknown slug shows the [404 page](#404-page) view (titled "Page not found",
  noindex, HTTP 200).
- **NAVIGATION TYPE:** child page.
- **PATTERN CHOICE (proposal):** [Detail page](#detail-page): breadcrumb (Home › Features ›
  title) in place of "Back to Features", icon tile, big title, description, bullets, actions.
- **REFERENCE IMAGES:** pattern-detail-1.png, teardown-detail-1.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: back link; one card.
  - COMPONENT TYPES: ghost link; icon badge; heading; paragraph; bullet list; buttons.
  - DATA FIELDS: feature (icon, title, description, bullets).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/Features.tsx` (one view for both routes).

### Pricing

- **SCREEN NAME:** Pricing (`/pricing/`)
- **PURPOSE:** Compare Free and Pro, and start the Pro checkout.
- **HOW USER GETS HERE:** header "Pricing"; "See Pricing" on Features and feature pages.
- **WHAT'S ON THE SCREEN:** hero: eyebrow "Pricing", title "Simple pricing for checklist
  workflows.", "Start with the free plan and upgrade when you need advanced template
  management."; plan card "Free" ("Core checklist building and runs."; "Create templates with
  sections and items", "Run checklists and track progress", "Browse public checklists"; "Start
  Free" outline → Register); plan card "Pro" ("$9/month. Cancel anytime."; "Import and export
  template backups", "Save public templates to your account", "Manage billing from account
  settings"; the Pro action); "Payments and subscription management are securely handled by
  Stripe."
- **PRIMARY ACTION:** the Pro action; for a Free User "Upgrade — $9/month" → Stripe Checkout.
- **SECONDARY ACTIONS:** "Start Free".
- **STATES (the Pro action):** signed out: "Get Started" (→ Register); "Checking plan..."
  (disabled); plan unknown: "Couldn't check your plan. Try again." with "Retry"; managed by
  support: "Your plan is managed by support. Contact support to change it."; paid: "Manage
  Pro" or "Manage subscription" (→ Account Settings); "Opening checkout..."; billing off:
  "Upgrade unavailable". A failed checkout shows a toast.
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (proposal):** [Page hero](#page-hero); 2-column bordered plan cards (title,
  price line, check list, button), like the cards in [Filterable grid](#filterable-grid).
- **REFERENCE IMAGES:** prompts-1.png, prompts-4.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: hero; 2-column plan cards; a footnote.
  - COMPONENT TYPES: plan card (title, muted line, check list, button); notice with retry.
  - DATA FIELDS: plan (name, description, features, action label and state).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/Pricing.tsx`. A plan label never shows before the plan loads.

### About

- **SCREEN NAME:** About (`/about/`)
- **PURPOSE:** Say what SERP Lists is for.
- **HOW USER GETS HERE:** footer "About".
- **WHAT'S ON THE SCREEN:** hero: eyebrow "About", title "Build repeatable work that feels easy
  to discover and execute.", "SERP Lists helps teams and solo operators turn repeatable work
  into checklists that are easy to run, track, and share.", "Explore Features" (primary),
  "Contact Us" (outline); 3 value cards (icon, title, description): "Clarity",
  "Consistency", "Community".
- **PRIMARY ACTION:** "Explore Features" → [Features](#features).
- **SECONDARY ACTIONS:** "Contact Us" → [Contact](#contact).
- **STATES:** static.
- **NAVIGATION TYPE:** root section (footer).
- **PATTERN CHOICE (proposal):** [Page hero](#page-hero); [Section row over a card
  grid](#section-row-over-a-card-grid) without the header row (3 cards, a muted top with the
  icon).
- **REFERENCE IMAGES:** home-1.png, prompts-1.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: hero; a 3-column card grid.
  - COMPONENT TYPES: eyebrow; heading; paragraph; buttons; card (icon badge, title,
    description).
  - DATA FIELDS: value (icon, title, description).
- **PROOF PASS:** Not restyled yet (step 2)
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
- **PATTERN CHOICE (proposal):** [Page hero](#page-hero); [Bordered list
  cards](#bordered-list-cards) (icon tile, title, description, action).
- **REFERENCE IMAGES:** home-1.png, home-3.png, home-4.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: hero; a 2-column card grid.
  - COMPONENT TYPES: card (icon badge, title, description, button).
  - DATA FIELDS: channel (icon, title, description, button label, mailto link).
- **PROOF PASS:** Not restyled yet (step 2)
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
- **PRIMARY ACTION:** "Sign in" → the `next` path, or [My Templates](#my-templates) (the
  console home) when there is none.
- **SECONDARY ACTIONS:** "Forgot password?"; "Sign up"; "Resend verification email"; show or
  hide the password.
- **STATES:** default; "Signing in..."; wrong credentials (toast "Invalid email or password",
  or the API's message); email not verified (toast "Email not verified. Check your inbox or
  resend verification.", the notice, the resend button); "Resending verification…"; a failed
  verification link (notice and toast); verified (toast "Email verified. You can sign in
  now."); `?verify_email=1` (toast "Verify your email first, then sign in."); the email
  prefilled after sign-up; already signed in (redirects to `next` or My Templates).
- **NAVIGATION TYPE:** child page (auth flow).
- **PATTERN CHOICE (proposal):** centered card form ([auth card frame](#auth-card-frame)).
- **REFERENCE IMAGES:** none (the reference has no auth pages).
- **STRUCTURE (current):**
  - LAYOUT ZONES: the auth card frame; a single form column.
  - COMPONENT TYPES: button grid (development only); status notice; labeled inputs with a
    leading icon; password toggle; full-width buttons; footer link.
  - DATA FIELDS: email; password; notice text; return path.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/Login.tsx`. One-shot query parameters (notices, the email) leave
  the address bar once read.

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
- **PATTERN CHOICE (proposal):** centered card form ([auth card frame](#auth-card-frame)).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: the auth card frame; a single form column.
  - COMPONENT TYPES: labeled inputs; password toggles; full-width primary button; footer link.
  - DATA FIELDS: name; email; password; password confirmation; return path.
- **PROOF PASS:** Not restyled yet (step 2)
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
- **PATTERN CHOICE (proposal):** centered card form ([auth card frame](#auth-card-frame)).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: the auth card frame; a form, or a message box.
  - COMPONENT TYPES: labeled input; full-width primary button; dashed message box; footer link.
  - DATA FIELDS: email.
- **PROOF PASS:** Not restyled yet (step 2)
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
- **PATTERN CHOICE (proposal):** centered card form ([auth card frame](#auth-card-frame)).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: the auth card frame; a form, or the expired message.
  - COMPONENT TYPES: labeled inputs; full-width primary button; dashed message box; footer link.
  - DATA FIELDS: new password; confirmation; token (read once, then removed from the URL).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/ResetPassword.tsx`. A reload after the token left the URL shows
  the expired state.

### Organization invite

- **SCREEN NAME:** Organization invite ("Organization Invite", `/team-invites/<token>/`)
- **PURPOSE:** Show an Organization invite and accept or decline it.
- **HOW USER GETS HERE:** an invite link a manager created in Account Settings; back from Log in
  or Register after "Log in to accept" or "Create an account".
- **WHAT'S ON THE SCREEN:** a centered card titled "Organization Invite" with a people icon.
  The body depends on the state:
  - Signed out: "Log in with the invited email address to see and accept this invite. New
    here? Create an account with that email address.", "Log in to accept" (primary), "Create
    an account" (outline).
  - Invite: the Organization's name; "<inviter> invited you to join as <Role>."; "Accepting
    does not change your current context. Switch to the Organization when you want to work in
    it."; "Accept invite" (primary), "Decline" (outline); an error line under them when a
    response fails.
  - Accepted: "Invite accepted."; "Switch to <Organization>" (primary), "Organization
    settings" (outline).
- **PRIMARY ACTION:** "Accept invite".
- **SECONDARY ACTIONS:** "Decline"; "Switch to <Organization>" → [My Templates](#my-templates)
  in that Organization; "Organization settings" → [Account Settings](#account-settings).
- **STATES:** no token ("This invite link is missing a token."); "Checking your session...";
  signed out; "Loading invite..."; the invite; "Responding..."; accepted; already a member
  ("You're already a member of <Organization>." with the same two buttons); declined ("Invite
  declined. You did not join <Organization>.", "Open templates"); a different account ("You're
  signed in as <email>. This invite was sent to a different email address. Sign out, then log
  in or create an account with the invited email address to accept it.", "Sign out and
  continue", "Signing out..."); an invite error (the reason, "Open settings").
- **NAVIGATION TYPE:** flow page (public shell).
- **PATTERN CHOICE (proposal):** centered card, like the [auth card frame](#auth-card-frame)
  without its aside.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: one centered card (title, body, button row).
  - COMPONENT TYPES: card; status line with a spinner or check icon; paragraphs; primary and
    outline buttons; error text.
  - DATA FIELDS: Organization name; inviter name or email; role; the signed-in email; state.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/TeamInviteAccept.tsx`. The path keeps its legacy name. Accepting
  never switches the active context by itself.

### Shared run

- **SCREEN NAME:** Shared run (`/share/<token>/`)
- **PURPOSE:** Let anyone with the link see a Run and tick its tasks without an account.
- **HOW USER GETS HERE:** a share link someone copied from the Share run dialog.
- **WHAT'S ON THE SCREEN:**
  - Its own sticky header, no site shell: an icon tile, the Run's title, "Shared run
    snapshot", "Copy Link" (outline).
  - A summary card: eyebrow "Shared run snapshot", the title, "A read-only checklist run that
    can be copied, reviewed, and verified without dashboard access.", a progress box ("Run
    progress", "N%", "X of Y tasks"), a progress bar, and "Complete run" once every task is
    done while the Run is in progress.
  - One card per section: title and "Complete" or "X/Y"; per task: a checkbox, the title
    (struck through when done), the description, content blocks (Sub-tasks have their own
    checkboxes), "Task notes" (placeholder "Add links, outcomes, or context for this
    run...", "Save notes", "Saved to this run").
  - Closing card: "Want to run your own checklist?", "Browse public templates and start a fresh
    run from a template that matches your workflow.", "Browse the Template Library".
- **PRIMARY ACTION:** tick a task.
- **SECONDARY ACTIONS:** "Copy Link"; notes; "Complete run" → the [Run complete
  dialog](#run-complete-dialog); "Browse the Template Library".
- **STATES:** loading (spinner); not found (toast "Run not found", then the Template Library);
  load error ("Unable to load run", the message, "Back"); completed (checkboxes frozen; notes
  stay editable); always noindex.
- **NAVIGATION TYPE:** standalone page.
- **PATTERN CHOICE (proposal):** the teardown layout of [Detail page](#detail-page) (one
  column, the progress as a facts strip); sections as [Bordered list
  cards](#bordered-list-cards) panels; the closing card as a [Call-to-action
  banner](#call-to-action-banner). TBD whether it gets the site header.
- **REFERENCE IMAGES:** teardown-detail-1.png, prompts-2.png, home-7.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: sticky header; a narrow column: summary card, section cards, closing card.
  - COMPONENT TYPES: icon tile; heading; progress box; progress bar; section card; task row
    with checkbox; content blocks; notes editor; call-to-action card.
  - DATA FIELDS: Run (title, progress, task counts, status); section (title, completed and
    total); task (title, description, done, content blocks, notes).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/ChecklistRun.tsx` (shared mode). Guests never see who owns the
  Run, and never see its retired work.

### My Templates

- **SCREEN NAME:** My Templates (`/dashboard/templates/`)
- **PURPOSE:** List the active context's Templates and start work from them.
- **HOW USER GETS HERE:** sidebar "Templates"; account menu "My Templates";
  `/dashboard/` (redirect); Home "Open Dashboard"; a sign-in with no return path; after
  creating a Template; "Back to Templates" and the editor's back arrow; "Switch to
  <Organization>" on an invite.
- **WHAT'S ON THE SCREEN:**
  - Page header: "My Templates", "N templates in your library", "New Template" (role-limited).
  - Toolbar: search "Search templates..."; a visibility select ("All", "Public", "Private"); a
    sort select ("Most Recent", "Alphabetical", "Most Tasks"); grid and list buttons ("Show
    templates in grid view", "Show templates in list view").
  - Grid (up to 4 columns): cards with a muted top holding the type icon; the title (a link to
    Template detail); the description; an actions menu ("Actions for <title>"); up to 2
    category chips and "+N"; "N sections", "N tasks"; "Public" or "Private"; a "Start Run"
    bar on hover (pointer only).
  - List: rows with an icon, title, description, "N sections", "N tasks", "Public" or
    "Private", and "Start Run", "Edit", "Delete".
- **PRIMARY ACTION:** open a Template → [Template detail](#template-detail).
- **SECONDARY ACTIONS:** "New Template" → [Template editor](#template-editor); "Start Run" →
  [Start Run dialog](#start-run-dialog); "Edit"; "Delete" → [Delete
  confirmations](#delete-confirmations); search; filter; sort; grid or list.
- **STATES:** "Loading templates..."; a load error ("Couldn't load your templates",
  "Something went wrong while loading. Check your connection and try again.", "Retry"; or
  "Your session has ended. Sign in again to continue.", "Sign in"); empty ("No templates
  found", "Create your first template to get started", "Create Template"); no matches ("Try
  adjusting your search or filters"); role-limited actions (runners: Start Run only; viewers:
  none); grid or list (remembered per user).
- **NAVIGATION TYPE:** root section (the console home).
- **PATTERN CHOICE (proposal):** shadcn page header and toolbar (search input, selects, a
  grid or list toggle group); cards with the muted top of [Section row over a card
  grid](#section-row-over-a-card-grid); list mode as rows; empty and error states as shadcn
  Empty.
- **REFERENCE IMAGES:** prompts-4.png, home-2.png. The reference has no console.
- **STRUCTURE (current):**
  - LAYOUT ZONES: page header (title, count, action); toolbar; scrolling results.
  - COMPONENT TYPES: search input; selects; toggle buttons; template card with an actions
    menu; list row with buttons; empty state.
  - DATA FIELDS: Template (type, title, description, categories, section count, task count,
    visibility); role permissions.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/Templates.tsx`. The list follows the active Ownership Context.

### Template detail

- **SCREEN NAME:** Template detail (`/dashboard/templates/<id>/`)
- **PURPOSE:** Review one Template, run it, share it and manage it.
- **HOW USER GETS HERE:** a title on My Templates; "From <template>" on My Runs; after "Save"
  on a public template page or a copy; "View template" on the editor's read-only notice.
- **WHAT'S ON THE SCREEN:**
  - Page header: the title; the description (or "Review template structure, metadata, and run
    actions."); actions: "Back" (ghost), a "Public" or "Private" badge, "Share" and "Edit"
    (roles that can edit), or a copy button for others ("Copy to Organization", "Copy to My
    Templates", "Upgrade to copy template", "Checking plan...", "Copying...", "Loading..."),
    "Start Run", and "Template actions" (roles that can edit).
  - An Organization error notice when the role is unknown ("Start Run waits until they load.
    Check your connection and try again.", "Retry").
  - Stat cards "Total Tasks" and "Sections".
  - "Template Structure": numbered sections (title, "N tasks") with their tasks (title,
    description, content blocks).
  - "Details": "Created", "Last updated", "Visibility" (a switch labeled "Public" or
    "Private").
  - "Categories & Tags": the categories or "No categories assigned"; the tags or "No tags
    assigned".
  - "Changelog" (roles that may see history): entries (label, who, date and time), or
    "Loading template history...", "Template history is unavailable right now.", "No template
    history has been recorded yet."
- **PRIMARY ACTION:** "Start Run" → [Run name dialog](#run-name-dialog).
- **SECONDARY ACTIONS:** "Share" → [Share link dialog](#share-link-dialog); "Edit" →
  [Template editor](#template-editor); the copy button; the visibility switch; "Template
  actions" → "Duplicate", "Export JSON" (or "Upgrade to export"), "Delete" ([Action
  menus](#action-menus)).
- **STATES:** "Loading template..."; a load error ("Unable to load template", the message,
  "Try again", "Back to Templates"); not found ("Template Not Found", "This template does not
  exist or you do not have access to it."); read-only for runners, viewers and other contexts;
  "Creating..." while sharing; visibility toasts ("Template is now public", "Template is now
  private").
- **NAVIGATION TYPE:** child page of My Templates.
- **PATTERN CHOICE (proposal):** the [Detail page](#detail-page) block shared with the public
  template page (breadcrumb My Templates › title, header with the actions, stats panel), then
  shadcn cards for the structure, details, categories and tags, and Changelog.
- **REFERENCE IMAGES:** pattern-detail-1.png, pattern-detail-2.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: page header (title, description, actions); notice; 2 stat cards; structure
    card; a 2-column grid of cards (Details, Categories & Tags); Changelog card.
  - COMPONENT TYPES: badge; outline, ghost and dark primary buttons; dropdown menu; stat card;
    numbered section list; switch with label; badge list; history list.
  - DATA FIELDS: Template (title, description, visibility, sections and tasks, created and
    updated dates, categories, tags); history entries (label, actor, time); role permissions;
    plan state.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/TemplateDetail.tsx`. An Organization's Template follows the
  viewer's role while that Organization is active; from any other context it is read-only.

### Template editor

- **SCREEN NAME:** Template editor (`/dashboard/templates/new/` and
  `/dashboard/templates/<id>/edit/`)
- **PURPOSE:** Create a Template or edit one: its settings, search fields, sections, tasks and
  content blocks.
- **HOW USER GETS HERE:** "New Template" (page header or sidebar), "Create Template"; "Edit" on
  a card, a list row or Template detail; "Resume template draft" in Billing.
- **WHAT'S ON THE SCREEN:**
  - Editor header (sticky): back arrow ("Back to templates"), the draft's title ("New
    Template" or "Untitled Template"), an "Editing" chip when editing, "Preview" (ghost),
    "Save", a theme toggle, "More actions".
  - Notices when needed: "Error" with the problems (and "Load latest version" after a
    conflict); "Unsaved template draft" ("Restore draft", "Discard"); "Unsaved template draft
    in <context>" ("Switch to <context>", "Discard"); plan or session notices ("Upgrade to Pro
    to save this template" with "Upgrade to Pro", "Organization plan limit", "Upgrade
    unavailable", "Signed out" with "Sign in").
  - Create only: "Generate from Clipy" ("Paste a public Clipy video link to fill this editor
    with an unsaved, editable draft.", a URL field "https://clipy.online/video/…", "Generate
    draft").
  - Outline (left): "Template Settings", "Search & SEO"; "Sections" with "Add section"; per
    section: drag handle, collapse or expand, title, "Add task to <section>", "Remove
    <section>"; per task: drag handle, title, "Remove <task>".
  - Panel (right), titled by the selection:
    - "Template Settings": "Template Name", "Goal / Summary", "Template Type" ("Checklist",
      "Recipe"), "Categories" ("Select categories..."), "Tags" ("Add tag..."), "Public
      Template" switch ("Make this template visible in the public library").
    - "Search & SEO": "Search Title", "URL Slug", "Search Description", "Preview".
    - "Section Settings": "Section Title", "Tasks in section".
    - "Task Details": "Task Title", "Description (Optional)", "Content Blocks" with "Add
      Block" and block cards (drag handle, type, remove), or "No content blocks yet".
    - Prompts: "Select a task from the outline to edit its instructions and attached
      content." and "Add a section from the outline to start building this template."
- **PRIMARY ACTION:** "Save". A create returns to [My Templates](#my-templates); an edit stays
  (toast).
- **SECONDARY ACTIONS:** "Preview" → [Template preview dialog](#template-preview-dialog); "Add
  Block" → [Add Block popover](#add-block-popover); "More actions" → "Discard changes"; the
  back arrow; reorder by drag or arrow keys; "Generate draft".
- **STATES:** loading (spinner); load error ("Unable to load template", "Back to Templates");
  checking permission (spinner); read-only ("You can't edit this template" or "You can't
  create templates here", with the role or owner reason, "View template", "Back to
  Templates"); "Saving...", "Uploading...", "Generating..." (Save disabled); locked while a
  create saves or a Clipy draft generates; unsaved changes ([browser
  confirm](#browser-confirm-prompts)); conflict; plan limit; session ended; kept drafts.
- **NAVIGATION TYPE:** child page; the panel changes in place with the outline selection.
- **PATTERN CHOICE (proposal):** shadcn blocks: an editor top bar; a two-pane body (the
  outline as a [Left category nav](#left-category-nav)-style list, the form panel with shadcn
  Field groups and Cards); Dialog for the preview.
- **REFERENCE IMAGES:** pattern-detail-2.png (section nav beside content). The reference has
  no editor.
- **STRUCTURE (current):**
  - LAYOUT ZONES: sticky editor header; notices; Clipy card (create); body: outline sidebar
    (fixed width) and a scrolling panel (max width, centered).
  - COMPONENT TYPES: icon button; chip; ghost and primary buttons; dropdown menu; alerts;
    mode buttons; tree list with drag handles and row actions; form fields (input, textarea,
    select, multi-select, tag input, switch); block cards; popover menu.
  - DATA FIELDS: Template (title, description, type, categories, tags, public, search title,
    URL slug, search description); sections (title, tasks); tasks (title, description, content
    blocks); save state; kept drafts.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/TemplateEditor.tsx`. The outline has a fixed width and no phone
  layout (TBD).

### My Runs

- **SCREEN NAME:** My Runs (`/dashboard/runs/`)
- **PURPOSE:** List the active context's Runs with their progress, and act on them.
- **HOW USER GETS HERE:** sidebar "Runs"; account menu "My Runs"; "Runs" on the Run page; after
  completing a Run.
- **WHAT'S ON THE SCREEN:**
  - Page header: "My Runs", "N in progress, M completed".
  - Toolbar: search "Search runs..."; status select ("All Runs", "In Progress", "Completed").
  - Rows: a status icon; the title (a link to `/dashboard/runs/<id>/`); meta ("From <template>"
    as a link, "Started <date>", "Completed <date>"); a progress bar with "x/y"; a status chip
    ("Completed" or "In Progress"); a "Needs revalidation", "Shared snapshot is out of date" or
    "Shared" chip; actions: "Revalidate", "Stop sharing to update", "Continue" (primary) or
    "View" (outline), and "Run options".
- **PRIMARY ACTION:** "Continue" → [Run page](#run-page).
- **SECONDARY ACTIONS:** "View"; "Revalidate"; "Stop sharing to update"; "Run options" →
  "Share Run", "Stop sharing", "Delete" ([Action menus](#action-menus)); search; filter.
- **STATES:** loading (5 skeleton rows); a load error ("Couldn't load your runs", "Retry" or
  "Sign in"); empty ("No runs found", "Start a run from one of your templates", "Browse the
  Template Library" → [Template Library](#template-library)); no matches ("Try adjusting your
  search or filters"); "Revalidating...", "Stopping..."; actions follow the role in the Run's
  Organization.
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (proposal):** shadcn page header and toolbar; rows as [List rows with
  thumbnail](#list-rows-with-thumbnail) with the status icon in the thumbnail's place, or a
  shadcn Table.
- **REFERENCE IMAGES:** teardowns-3.png, teardowns-4.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: page header; toolbar; a list of row cards.
  - COMPONENT TYPES: search input; select; row card (icon, text, progress, chips, buttons,
    dropdown menu); skeleton rows; empty state.
  - DATA FIELDS: Run (title, status, progress, task counts, started and completed dates,
    shared, stale); source Template (title, link); permissions.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/Dashboard.tsx` (the list view is RunsDashboardView). Rows link to
  a Run's one URL, `/dashboard/runs/<id>/`, which Start Run opens too.

### Run page

- **SCREEN NAME:** Run page (`/dashboard/runs/<id>/`)
- **PURPOSE:** Work through a Run task by task, add notes, complete it, share it.
- **HOW USER GETS HERE:** Start Run; the title, "Continue" or "View" on My Runs. The older
  `/run/<id>` address answers 308 with this one.
- **WHAT'S ON THE SCREEN:**
  - Page header: the title (an inline field while renaming); "X of Y tasks finished";
    actions: "Runs" (back), "Rename" (or "Save title" and "Cancel"), a "Completed" or "In
    Progress" badge, a "View only" badge, "Complete run" when every task is done, a progress
    bar with "N%" (from `xl`), a "Shared" badge, "Share", "Stop sharing".
  - An Organization error notice when the role is unknown ("This run's actions wait until they
    load. Check your connection and try again.", "Retry").
  - Below `xl`: a progress block ("N% complete", "X of Y tasks finished", "Task N of M",
    "Tasks" → [Run tasks sheet](#run-tasks-sheet), a progress bar).
  - Task panel: "<section> / Task N of M"; a task checkbox; the task's title and
    description; content blocks, or "No additional content for this task"; "Task notes"
    ("Save notes", "Saved to this run").
  - A footer pinned to the bottom of the window: "Previous", the primary action ("Mark
    Complete", "Next Task", "Next unfinished task", "Finish Run", "Run completed" or "View
    only"), "Next".
  - "Removed from Template (N)" (collapsed; the retired work, read-only).
  - "Changelog": entries (label, who, time), or "Loading run history...", "Run history is
    unavailable right now.", "No run history has been recorded yet."
  - From `xl`, a right column: "Progress", the task list by section, "Overall Progress" with
    "X / Y tasks" and a bar.
- **PRIMARY ACTION:** "Mark Complete".
- **SECONDARY ACTIONS:** "Previous" and "Next"; pick a task; notes; "Rename"; "Share" →
  [Share link dialog](#share-link-dialog); "Stop sharing"; "Complete run" and "Finish Run" →
  [Run complete dialog](#run-complete-dialog); "Runs".
- **STATES:** loading (spinner); not found (toast "Run not found", then My Templates); a load
  error ("Unable to load run", the message, "Back"); in progress; every task done (the
  completion prompt, and "Complete run" stays); completed (frozen: "Run completed"); view only
  (viewers); role unknown (the notice); unsaved notes ([browser
  confirm](#browser-confirm-prompts)); "Creating link...", "Stopping..."; toasts ("Run title
  updated", "Sharing stopped. The old link no longer works.").
- **NAVIGATION TYPE:** child page of My Runs.
- **PATTERN CHOICE (proposal):** shadcn blocks: a page header with actions; a two-column body
  (the task panel, and the task list as a [Left category nav](#left-category-nav)-style
  column on the right); a sticky action bar; a Sheet for the task list on narrow screens.
- **REFERENCE IMAGES:** pattern-detail-2.png, pattern-detail-3.png. The reference has no run
  view.
- **STRUCTURE (current):**
  - LAYOUT ZONES: page header; notice; progress block (below `xl`); main column (task header,
    content, notes, sticky footer, retired work, Changelog); right column (from `xl`).
  - COMPONENT TYPES: inline title field; badges; buttons; progress bars; checkbox;
    content blocks; notes editor (textarea, button, saved indicator); disclosure; history
    list; task list (nav with current-task marker); sheet.
  - DATA FIELDS: Run (title, status, progress, task counts, shared, sections, tasks, notes,
    retired work, history); selected task (section, position, title, description, content,
    done); permissions.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/ChecklistRun.tsx`. The same view renders the shared run.

### Import Templates

- **SCREEN NAME:** Import Templates (`/dashboard/import-templates/`)
- **PURPOSE:** Import Templates from a portable pack, and export the context's Templates.
- **HOW USER GETS HERE:** sidebar "Import Templates" (in the sidebar sheet on phones).
- **WHAT'S ON THE SCREEN:**
  - Page header: "Import Templates", "Move checklist packs between environments or bootstrap
    your template library from a portable JSON sample.", a "JSON packs" chip (from `sm`).
  - One card, "Template JSON Import & Export", "Export portable template packs or import
    compatible JSON files for <context>.", a "Portable packs" chip:
    - A plan notice when the plan does not allow it ("Pro feature" or "Paid Organization
      feature", "Upgrade to Pro" or "Upgrade unavailable"), or "Couldn't check your plan" with
      "Retry".
    - "Editor access required" for Organization roles that cannot edit.
    - Counts: "My Templates" (or "Organization Templates"), "Public", "Private".
    - "Export Templates": a switch "Include public community templates" with its note;
      "Export Portable Pack".
    - "Import Templates": "Import visibility" ("Preserve visibility from file", "Force public",
      "Force private") and "Templates missing a visibility flag default to private."; a file
      field "Select a YAML, JSON, or Markdown template file"; "Need an example? Download
      sample portable pack".
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
- **PATTERN CHOICE (proposal):** shadcn page header and cards: an Export card and an Import
  card with Field groups; the preview and result as cards.
- **REFERENCE IMAGES:** none (the reference has no console).
- **STRUCTURE (current):**
  - LAYOUT ZONES: page header; one card: notices, counts, Export section, Import section,
    preview card, result card.
  - COMPONENT TYPES: chip; notice; count trio; switch; buttons; select; file input; link
    button; preview card with badges and lists; result card.
  - DATA FIELDS: context name; Template counts; plan state; import visibility; file; preview
    (Templates, warnings, limits); result (attempted, imported, failed).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/TemplateImportExport.tsx`. Import and export need a paid plan in
  the active context.

### Archive

- **SCREEN NAME:** Archive (`/dashboard/archive/`)
- **PURPOSE:** Restore deleted Templates and Runs of the active context.
- **HOW USER GETS HERE:** sidebar "Archive" (in the sidebar sheet on phones).
- **WHAT'S ON THE SCREEN:** page header "Archive", "Archived templates and runs. Restore one to
  put it back in your list."; a chip "Loading" or "N archived"; two panels, side by side from
  `lg`: "Archived templates" and "Archived runs" (each with its count); rows: the title,
  "Archived <date>", "Restore".
- **PRIMARY ACTION:** "Restore".
- **SECONDARY ACTIONS:** "Retry" on a failed list.
- **STATES:** per list: "Loading archived templates..." (or runs); an error ("Couldn't load
  your archived templates", "Retry"); empty ("No archived templates", "No archived runs");
  "Restoring..."; role-limited (restoring a Template needs editor or above, a Run admin or
  above; the items stay listed); a restore the plan refuses shows the API's reason; an item restored
  elsewhere reloads the lists.
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (proposal):** shadcn page header; two panels as in [Bordered list
  cards](#bordered-list-cards) (prompts-2.png "By role": header row, list rows with a trailing
  action).
- **REFERENCE IMAGES:** prompts-2.png, prompts-3.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: page header; count chip; a 2-column grid of panels.
  - COMPONENT TYPES: panel (header with icon, title, count; rows); row (title, date, outline
    button); error state.
  - DATA FIELDS: archived item (title, archived date, kind); list state; role permissions.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/Archive.tsx`. Every "Delete" in the app moves the item here.

### Account Settings

- **SCREEN NAME:** Account Settings (`/dashboard/settings/`)
- **PURPOSE:** Manage the profile, billing, Run Keys, Organizations and security.
- **HOW USER GETS HERE:** sidebar "Settings"; account menu "Settings"; the context switcher's
  "Settings"; "Organization settings" and "Open settings" on an invite; "Manage Pro" or
  "Manage subscription" on Pricing.
- **WHAT'S ON THE SCREEN:** page header "Account Settings", "Manage your profile, billing, and
  security settings."; stacked cards:
  - "Profile Information": "Profile Picture" (avatar upload and remove); "Email" (disabled,
    "Email cannot be changed"); "Full Name"; "Username" (after "@"); "Public profile URL:"
    (a link); "Update Profile".
  - "Billing": "Current Personal plan:" or "Current Organization plan:" with the plan;
    "Resume template draft" when a draft is kept; the status error with "Retry"; "Billing
    checkout is currently unavailable."; the Organization billing message; "Manage
    subscription"; "Upgrade to Pro — $9/month".
  - "Agent Access" (only where the Run Key UI is enabled): "Fixed run-only permissions";
    "Key name" ("Codex SOP Runner") and "Create Run Key"; a new key's panel ("Copy <name> and
    connect your agent", the secret, "Copy key", "I have saved this key"); "MCP connection"
    (the endpoint with a copy button); "Personal Run Keys" (name, "Active" or "Revoked",
    prefix, created and last used, "Revoke"), or "No Run Keys yet."
  - "Organizations": "Incoming invites" ("Accept"); a create form ("Organization name",
    "Slug", "Create Organization"); "Your Organizations" (name, role, "Selected" or
    "Select"); for the active Organization: its name, "Your role: <role>", the role's
    description; for managers: a rename form ("Save Organization") and invites ("Invite
    email", "Role", "Create link", the link with a copy button, "Pending invites" with "New
    link" and revoke); "Owners and admins manage Organization settings, invites, and
    activity." for others; "Members" (name, "You", email, role and status selects, "Make
    owner"); "Activity". In Personal: "Create or select an Organization to share templates
    and runs."
  - "Leave Organization" (in an Organization, not its owner): "Leave <name> and return to your
    Personal context. …", "Leave Organization".
  - "Security": "Change password" ("Current password", "New password", "Confirm new password",
    "Sign out other sessions" switch with "Keeps you signed in on this device.", "Update
    password"); "Sessions" ("Quickly sign out other devices if you suspect misuse.", "Sign out
    other sessions").
- **PRIMARY ACTION:** "Update Profile".
- **SECONDARY ACTIONS:** billing actions; "Create Run Key", "Revoke" → [Revoke Run Key
  dialog](#revoke-run-key-dialog); Organization actions ("Leave Organization" and "Make owner"
  ask a [browser confirm](#browser-confirm-prompts)); "Update password"; "Sign out other
  sessions".
- **STATES:** Personal or Organization context; role-limited Organization controls (owners and
  admins manage); "Couldn't load your Organizations." with "Retry"; members, invites, keys and
  activity each load or fail on their own ("Loading members...", "Couldn't load members.");
  busy labels ("Updating...", "Creating...", "Saving...", "Accepting...", "Leaving...",
  "Opening billing...", "Revoking...", "Signing out...").
- **NAVIGATION TYPE:** root section.
- **PATTERN CHOICE (proposal):** shadcn settings layout: a section nav ([Left category
  nav](#left-category-nav)) or Tabs for Profile, Billing, Agent Access, Organizations and
  Security; each section a Card with Field groups.
- **REFERENCE IMAGES:** patterns-2.png, pattern-detail-2.png (section nav). The reference has
  no settings.
- **STRUCTURE (current):**
  - LAYOUT ZONES: page header; one column of cards (max width, centered).
  - COMPONENT TYPES: card; avatar upload; inputs; switches; selects; buttons; list rows;
    notices; copy fields; alert dialog.
  - DATA FIELDS: User (email, name, username, avatar); plan; Run Keys; Organizations (name,
    slug, role, members, invites, activity); password fields.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/Account.tsx` (the route renders `src/views/DashboardSettings.tsx`,
  which re-exports it). Issue #206 tracks splitting this page.

### 404 page

- **SCREEN NAME:** 404 page ("That page does not exist")
- **PURPOSE:** Say the address is not a page and offer a way home.
- **HOW USER GETS HERE:** any path no route matches (HTTP 404); an unknown feature slug or
  category (HTTP 200, noindex).
- **WHAT'S ON THE SCREEN:** a centered card: eyebrow "404", "That page does not exist", "The
  route <path> could not be found. Use the main navigation or head back to the home page." (the
  server's HTML says "This route"), "Return to home".
- **PRIMARY ACTION:** "Return to home" → [Home](#home).
- **SECONDARY ACTIONS:** the shell's navigation.
- **STATES:** none. Titled "Page not found", `noindex, follow`, no canonical URL.
- **NAVIGATION TYPE:** system page.
- **PATTERN CHOICE (proposal):** [Page hero](#page-hero) (eyebrow, title, description, one
  button) with no card.
- **REFERENCE IMAGES:** home-1.png.
- **STRUCTURE (current):**
  - LAYOUT ZONES: a centered card filling the window's height.
  - COMPONENT TYPES: eyebrow; heading; paragraph; primary button.
  - DATA FIELDS: the missing path.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Code: `src/views/NotFound.tsx`, `src/app/not-found.tsx`. The shell follows the
  path, so a missing path under `/dashboard/` gets the console shell.

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
  console home), "My Runs", "Settings", "Profile" (only with a username; opens a new tab);
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
- **NAVIGATION TYPE:** dropdown menu; the page changes in place.
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
- **NOTES:** A switch reloads the page's lists in the new context and is remembered per tab.

### Start Run dialog

- **SCREEN NAME:** Start Run dialog
- **PURPOSE:** Pick a Template and name a new Run.
- **HOW USER GETS HERE:** "Start Run" on a My Templates card (hover bar or actions menu) or list
  row.
- **WHAT'S ON THE SCREEN:** "Start Run", "Pick one of your templates and launch a new run.";
  a Template select ("Select a template"); a name field whose placeholder is the default name
  ("<template title> - <date and time>"); "Cancel", "Start Run".
- **PRIMARY ACTION:** "Start Run" → [Run page](#run-page) (toast "Checklist run created").
- **SECONDARY ACTIONS:** "Cancel".
- **STATES:** "Creating..."; a plan limit starts checkout (the dialog stays busy); an ended
  session goes to Log in; a failure keeps the typed name.
- **NAVIGATION TYPE:** modal dialog.
- **PATTERN CHOICE (proposal):** shadcn Dialog with labeled Fields.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: header (title, description); form (select, input); footer (two buttons).
  - COMPONENT TYPES: select; input; outline and primary buttons.
  - DATA FIELDS: Templates (id, title); run name; default name.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** The select and the name field have no visible labels.

### Run name dialog

- **SCREEN NAME:** Run name dialog ("Name Your Checklist Run")
- **PURPOSE:** Name a new Run of the open Template.
- **HOW USER GETS HERE:** "Start Run" on Template detail.
- **WHAT'S ON THE SCREEN:** "Name Your Checklist Run", "Give your new checklist run a
  descriptive name to help you track progress."; "Run Name" (placeholder: the default name);
  "Cancel", "Start Checklist".
- **PRIMARY ACTION:** "Start Checklist" → [Run page](#run-page).
- **SECONDARY ACTIONS:** "Cancel".
- **STATES:** "Creating..." (field disabled); a failure keeps the dialog and the typed name.
- **NAVIGATION TYPE:** modal dialog.
- **PATTERN CHOICE (proposal):** shadcn Dialog, the same block as the [Start Run
  dialog](#start-run-dialog).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: header; one labeled field; footer.
  - COMPONENT TYPES: label; input; outline and primary buttons.
  - DATA FIELDS: run name; default name.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Its wording differs from the Start Run dialog's; the public template page starts a
  Run with no dialog.

### Share link dialog

- **SCREEN NAME:** Share link dialog ("Share run", "Share Template")
- **PURPOSE:** Show a created link with a copy button, so the link is never lost.
- **HOW USER GETS HERE:** "Share" on the Run page; "Share Run" in My Runs' "Run options";
  "Share" on Template detail.
- **WHAT'S ON THE SCREEN:** the title; the description ("Anyone with this link can open this
  run without signing in." or "Share this template with others. They can view it and copy it
  into their library."); a read-only link field ("Share link"); a copy button ("Copy share
  link"); "Close".
- **PRIMARY ACTION:** copy the link.
- **SECONDARY ACTIONS:** "Close".
- **STATES:** copied (toast "Share link copied", "Share link copied to clipboard" or "Public
  link copied"); copy refused (toast "Couldn't copy the link. Select it and copy it
  manually.").
- **NAVIGATION TYPE:** modal dialog.
- **PATTERN CHOICE (proposal):** shadcn Dialog with a copy input group.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: header; link row; footer.
  - COMPONENT TYPES: read-only input; icon button; outline button.
  - DATA FIELDS: title; description; URL.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** While a Run is shared, Share on the same page shows its link again; a new share
  mints a new link and ends the old one.

### Run complete dialog

- **SCREEN NAME:** Run complete dialog ("Checklist Completed!")
- **PURPOSE:** Confirm completing a Run.
- **HOW USER GETS HERE:** ticking the last open task; "Complete run"; "Finish Run".
- **WHAT'S ON THE SCREEN:** "Checklist Completed!", "Congratulations! You have completed all
  items in this checklist.", a large check icon, one button: "Return to Dashboard" (private
  Run) or "Return to Public Runs" (shared Run).
- **PRIMARY ACTION:** the button: it completes the Run (toast "Checklist completed!", with an
  emoji) and leaves for [My Runs](#my-runs), or the [Template Library](#template-library) for
  a shared Run.
- **SECONDARY ACTIONS:** dismiss; the Run stays in progress and "Complete run" stays.
- **STATES:** a save failure shows a toast and keeps the dialog.
- **NAVIGATION TYPE:** modal dialog.
- **PATTERN CHOICE (proposal):** shadcn AlertDialog (confirm and cancel).
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: header; icon; footer.
  - COMPONENT TYPES: heading; paragraph; icon; primary button.
  - DATA FIELDS: shared or private.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** The label says "Return" while the click completes the Run. There is no Public
  Runs page.

### Delete confirmations

- **SCREEN NAME:** Delete confirmations ("Delete template", "Delete run")
- **PURPOSE:** Confirm a delete. The item moves to [Archive](#archive), where it can be
  restored.
- **HOW USER GETS HERE:** "Delete" on a My Templates card menu or list row; "Delete" in
  Template detail's "Template actions"; "Delete" in My Runs' "Run options".
- **WHAT'S ON THE SCREEN:** "Delete template" with "Are you sure you want to delete this
  template?" (My Templates) or "Are you sure you want to delete "<title>"?" (Template detail);
  "Delete run" with "Are you sure you want to delete this run?"; "Cancel", "Delete".
- **PRIMARY ACTION:** "Delete" (toast "Template deleted" or "Run deleted"; Template detail
  returns to My Templates).
- **SECONDARY ACTIONS:** "Cancel".
- **STATES:** "Deleting..."; a failure toast; an item deleted elsewhere closes the dialog and
  reloads the list.
- **NAVIGATION TYPE:** modal dialog (an alert dialog on Template detail).
- **PATTERN CHOICE (proposal):** shadcn AlertDialog for all three, with a destructive action.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: header (title, question); footer (two buttons).
  - COMPONENT TYPES: heading; paragraph; outline and destructive buttons.
  - DATA FIELDS: item kind; title (Template detail).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** The API archives the item. The UI says Delete and never says it cannot be undone.

### Action menus

- **SCREEN NAME:** Action menus
- **PURPOSE:** Per-item actions that do not fit on a card or row.
- **HOW USER GETS HERE:** "Actions for <title>" on a My Templates card; "Template actions" on
  Template detail; "Run options" on a My Runs row; "More actions" in the editor header.
- **WHAT'S ON THE SCREEN:**
  - Template card: "Edit", "Start Run", "Delete" (by role).
  - Template detail: "Duplicate" ("Duplicating..."), "Export JSON" or "Upgrade to export",
    "Delete".
  - Run row: "Share Run", "Stop sharing" (a shared Run), "Delete" (by role).
  - Editor: "Discard changes".
- **PRIMARY ACTION:** the first item.
- **SECONDARY ACTIONS:** the rest.
- **STATES:** role-limited items; disabled while an action runs.
- **NAVIGATION TYPE:** dropdown menu.
- **PATTERN CHOICE (proposal):** shadcn DropdownMenu, the destructive item last after a
  separator.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: icon trigger; item list; separator; destructive item.
  - COMPONENT TYPES: icon button; menu items with icons.
  - DATA FIELDS: item; permissions; plan state (export).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** On a card the trigger shows on hover, keyboard focus and touch screens.

### Template preview dialog

- **SCREEN NAME:** Template preview dialog
- **PURPOSE:** Show the draft as it will read, without saving.
- **HOW USER GETS HERE:** "Preview" in the editor header.
- **WHAT'S ON THE SCREEN:** "Template preview", "This preview reflects the current draft.
  Saving is not required."; the draft's title (or "Untitled Template") and description; its
  sections with every task open.
- **PRIMARY ACTION:** close.
- **SECONDARY ACTIONS:** none.
- **STATES:** follows the draft as typed.
- **NAVIGATION TYPE:** modal dialog (large, scrolling).
- **PATTERN CHOICE (proposal):** shadcn Dialog reusing the public template page's "What's
  included" block.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: header; a bordered preview (title, description, sections).
  - COMPONENT TYPES: heading; paragraph; section and task list.
  - DATA FIELDS: draft title, description, sections.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** none.

### Add Block popover

- **SCREEN NAME:** Add Block popover
- **PURPOSE:** Add a content block to a task.
- **HOW USER GETS HERE:** "Add Block" in the Content Blocks header, or in the "No content
  blocks yet" box.
- **WHAT'S ON THE SCREEN:** "Text", "Image", "Video", "File", "Embed", "Sub-tasks".
- **PRIMARY ACTION:** pick a block type.
- **SECONDARY ACTIONS:** click outside to close.
- **STATES:** open or closed.
- **NAVIGATION TYPE:** popover menu.
- **PATTERN CHOICE (proposal):** shadcn DropdownMenu.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: trigger; a floating list.
  - COMPONENT TYPES: ghost button; menu buttons with icons.
  - DATA FIELDS: block type (icon, label).
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** Hand-built today (a positioned list of buttons).

### Run tasks sheet

- **SCREEN NAME:** Run tasks sheet ("Tasks")
- **PURPOSE:** Open any task of the Run on narrower screens.
- **HOW USER GETS HERE:** "Tasks" in the Run page's progress block, below `xl`.
- **WHAT'S ON THE SCREEN:** a sheet from the bottom: "Tasks", "Open any task in this run.";
  the task list by section ("Run tasks"), the current task marked.
- **PRIMARY ACTION:** pick a task (the sheet closes).
- **SECONDARY ACTIONS:** close.
- **STATES:** focus starts on the current task and returns to "Tasks" on close.
- **NAVIGATION TYPE:** sheet.
- **PATTERN CHOICE (proposal):** shadcn Sheet holding the same list as the `xl` column.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: header; scrolling list.
  - COMPONENT TYPES: sheet; grouped task list with a current marker.
  - DATA FIELDS: sections; tasks (title, done, current).
- **PROOF PASS:** Not restyled yet (step 2)
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
- **PATTERN CHOICE (proposal):** shadcn AlertDialog with a destructive action.
- **REFERENCE IMAGES:** none.
- **STRUCTURE (current):**
  - LAYOUT ZONES: header; footer.
  - COMPONENT TYPES: heading; paragraph; cancel and destructive buttons.
  - DATA FIELDS: key name.
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** none.

### Browser confirm prompts

- **SCREEN NAME:** Browser confirm prompts
- **PURPOSE:** Ask before losing work or access.
- **HOW USER GETS HERE:**
  - Unsaved changes in the Template editor (form edits, a file still uploading, a save in
    flight) or on the Run page (unsaved task notes): on an in-app link, Back or Forward, and
    "Sign out"; the browser's own leave prompt on a reload or tab close.
  - In the editor: "Load latest version" with unsaved edits; a Clipy draft or "Restore draft"
    replacing unsaved work.
  - In Account Settings: "Leave <name>? You will lose access to its Templates and Runs." and
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
- **PROOF PASS:** Not restyled yet (step 2)
- **NOTES:** TBD whether the Back and Forward guard can wait for an in-page dialog.

## Open questions

Found while reading the code; none is decided here.

- Starting a Run: My Templates' dialog says "Start Run", Template detail's says "Name Your
  Checklist Run" and "Start Checklist", and the public template page asks nothing.
- The Run complete dialog's only button reads "Return to Dashboard" or "Return to Public Runs"
  but completes the Run; there is no Public Runs page.
- The shared run page calls itself "A read-only checklist run", yet guests can tick tasks, add
  notes and complete the Run.
- A missing path under `/dashboard/` renders the 404 page inside the console shell, also for
  a signed-out visitor: `src/app/not-found.tsx` renders the shell without the session check.
- Categories shows nothing (no message) when a search matches no category.
- The Template editor's outline has a fixed width and no phone layout.
- The Start Run dialog's fields have no visible labels.
- The reference tints its icon tiles; step 1 keeps them neutral (no custom colors). The
  category page already has a color per built-in category that the tiles could use.
- On phones the console's context switcher sits in the sidebar sheet, so the active context
  (Personal or an Organization) is no longer on screen at a glance, as it was in the old
  phone bar. The phone top bar has room to show it.
