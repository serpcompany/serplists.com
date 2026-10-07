# UI app map

Phase 1 of the UI runbook for the web app: every screen, the flows that connect them, and
how each page is reached. The [UI screen inventory](ui-screen-inventory.md) holds a spec card
for each screen and overlay (phases 2 and 3). The design reference is
https://aiuxplayground.com/.

Paths are canonical: a page ends in a slash ([URL standard](../FRONTEND.md#urls)). `<handle>`
(a username or an Organization's slug), `<user>`, `<template>`, `<id>`, `<slug>` and `<token>`
stand for route parameters. Quoted words are
the labels the app shows. Product terms follow [PRODUCT_SENSE.md](../PRODUCT_SENSE.md).

## Shells

`src/components/Layout.tsx` picks the shell from the path (`resolveRouteShell` in
`src/lib/routes.ts`).

- **Public shell:** site header and site footer. Every page in the `(site)` route group, and
  the 404 page (on a missing console path too, for anyone not signed in).
- **Console shell:** the console sidebar (shadcn's Sidebar block, a sheet on phones), a top bar
  with the sidebar trigger and the public header's navigation, and the site footer. Every page
  under `/dashboard/`. These pages sit in the `(app)` route group, which checks the session
  first: a signed-out visitor goes to `/login/?next=<path>`.
- **No shell:** the shared run page, `/share/<token>/`. A guest may have no account, so it
  has its own small header and no footer.

## Navigation types

- **Root section:** a top-level destination, linked from the site header, the console
  sidebar or the site footer.
- **Child page:** a deeper page reached from a root section by a link (the web's push).
  Browser Back returns. A flow page is a child page in a task sequence (sign-in, reset,
  invite).
- **Standalone page:** opened from a link outside the app, with no site shell.
- **Modal dialog:** a centered dialog over the page; the page stays put.
- **Sheet:** a panel that slides in from a screen edge (phone menus, the Run task list, the
  Template editor's outline below `lg`).
- **Dropdown menu or popover:** a menu anchored to its trigger (account menu, context
  switcher, action menus, selects, Add Block).
- **In-place state:** the page changes without a navigation (tabs of a panel, grid or list,
  filters, collapsible sections, loading, empty and error states).
- **Browser confirm:** the browser's own `confirm()` prompt (unsaved changes, leaving an
  Organization).

## Main areas

- **Public site:** Home, the Template Library, Categories, Features, Pricing, About, Contact.
- **Auth:** Log in, Register, Forgot password, Reset password.
- **Public Profiles and Public Templates:** the Profiles directory, `/profiles/` (People and
  Organizations), `/profile/<handle>/` (a User's or an Organization's) and
  `/profile/<handle>/<template>/`, and a Public Template's guest run,
  `/profile/<handle>/<template>/run/`.
- **Shared runs:** `/share/<token>/`, a Run opened through its share link.
- **Organization invites:** `/team-invites/<token>/`.
- **Signed-in console:**
  - Templates: My Templates, Template detail, Template editor (create and edit).
  - Runs: My Runs, the Run page.
  - Import Templates (import and export).
  - Archive (restore deleted Templates and Runs).
  - Settings: profile, billing, Run Keys, Organizations, security.
- **System:** the 404 page.

## Flows

Each step is a screen, and a quoted label is the control that moves the user on.

- **First visit to a first Run:** Home → "Browse the Template Library" → Template Library →
  template card → Public template page → "Start Run" → Start a Run dialog → "Start Run" →
  Guest run (`/profile/<user>/<template>/run/`, kept in the browser, no account) → task
  checkbox or "Mark Complete" → … → "Complete this Run?" → "Complete Run" → the same Guest run,
  now "Completed". Back on the template page while the run is in progress, "Continue Run"
  opens it again; a plain link to the run page (from a code project or a SKILL.md file) opens
  it too, and starts one when the browser has none. "Delete run" → "Delete run" dialog →
  "Delete" → Public template page. With a Form in the run: "Export answers" → "Download CSV"
  or "Download JSON" → the file downloads, and the Guest run stays.
- **Save a guest run into an account:** Guest run → "Log in" (or "sign up" → Register, and
  email verification) → Log in → "Sign in" → the same Guest run → "Save to account" → Run page
  (`/dashboard/runs/<id>/`, "Run saved to your account"). Signed in elsewhere: Public template
  page → "Your run of this Template is saved in this browser only." → "Save to account" → Run
  page. At the active-run limit: "Save to account" → Stripe Checkout (Personal), and the guest
  run stays.
- **First Run in an account:** any public page → "Get started" → Register → "Create account"
  → Log in ("Verify your email first, then sign in.") → verification email link → Log in
  ("Email verified. You can sign in now.") → "Sign in" → My Templates → "Template Library" →
  Public template page → "Start Run" → Start a Run dialog → "Start Run" → Run page
  (`/dashboard/runs/<id>/`). Signed in, the public template page's Start Run always starts a
  Run in the account; a signed-in user who opens a guest run link with no guest run in the
  browser lands on the template page.
- **First visit from the header:** any public page → "Get started" → Register → "Create
  account" → My Templates. With email verification: → Log in → email link → "Sign in" →
  My Templates (a sign-in with no return path opens `/dashboard/`, which opens the remembered
  context's Templates, Personal's for a new account).
- **Returning user:** Home → "Log in" → Log in → "Sign in" → My Templates. Signed in: Home →
  "Open Dashboard" → My Templates, or account menu → "My Templates". A bookmarked
  `/dashboard/` opens the remembered context's My Templates. A console link opened while signed out → Log in
  (`?next=<path>`) → "Sign in" → that page.
- **Create a Template:** My Templates → "New Template" (page header or sidebar) → Template
  editor → Template Settings fields (Required tools: "Add tool", then each tool's "Name", "URL"
  and "Required") → outline "Add section" and "Add task to <section>" →
  Task Details → "Add Block" (→ "Form": "Add field", each field's "Label", "Type" and
  "Required") → "Save" → My Templates. Below `lg` the outline is a sheet:
  "Outline" in the editor's top bar → "Add section" or "Add task to <section>" (the sheet
  closes on the new entry's form) → "Outline" again for the next. On a new Template, "Generate from Clipy"
  → "Generate draft" fills the form first. At the plan's Template limit: "Save" → notice
  → "Upgrade to Pro" → Stripe Checkout → back → "Restore draft" → "Save".
- **Edit a Template:** My Templates → card actions menu → "Edit" (or the list row's "Edit")
  → Template editor → "Save" (stays, with a toast) → back arrow → My Templates. From the
  detail page: My Templates → title → Template detail → "Edit" → Template editor. Another
  save came first: "Save" → "Error" alert → "Load latest version".
- **Run a checklist, complete it, share it:** My Templates → "Start Run" (card hover, card
  actions menu or list row) → Start a Run dialog → "Start Run" → Run page → task checkbox or
  "Mark Complete" (a task with a form: fill in its fields first; with a required field empty or
  an answer not valid, the click shows each field's message and moves focus to the first, and
  saves nothing) → "Next Task" → … → last task done → "Complete this Run?" dialog →
  "Complete Run" → My Runs ("Not yet" keeps the Run in progress, and "Complete run" stays on
  the page). From Template detail or a public
  template page: "Start Run" → the same Start a Run dialog → "Start Run" → Run page. Share:
  Run page "Share"
  (or My Runs → "Run options" → "Share Run") → Share run dialog → copy the link. Guest:
  Shared run → tick tasks, add notes → "Complete this Run?" → "Complete Run" → the same Shared
  run, now "Completed".
- **Duplicate a Template:** Template detail → "Template actions" → "Duplicate" → Template
  detail of the copy ("Template duplicated"). Someone else's Public Template: "Copy to My
  Templates" (or "Copy to Organization") → Template detail of the copy.
- **Transfer a Template to an Organization:** Template detail of a private Personal
  Template → "Template actions" → "Transfer to Organization" → choose the Organization →
  "Transfer" → Template detail at the Organization's URL ("Template transferred to
  <Organization>").
- **Save a Public Template:** Public template page → "Save" or "Copy to Library" → Template
  detail of the new copy. Signed out: → Log in → back → "Save". Free in Personal: "Upgrade
  to save" → Stripe Checkout.
- **Publish a Template:** Template detail → "Share" → Share Template dialog (the
  `/profile/<handle>/<template>/` link, under the User's username or, for an Organization's
  Template, the Organization's slug) → copy. Or the "Visibility" switch in Details. No
  username yet: a toast asks for one → Account Settings → "Username" → "Update Profile". An
  Organization without a slug: a toast says it needs one → the Organization's settings →
  "Slug".
- **Organization invite:** manager: the Organization's settings
  (`/dashboard/organization/<organizationId>/settings/`, the switcher's "Settings") →
  its card → "Invite email" and "Role" → "Create link" → copy the invite link and send it. Invitee: Organization invite
  → signed out: "Log in to accept" (or "Create an account") → Log in → back to the invite →
  "Accept invite" → "Invite accepted." → "Switch to <Organization>" → My Templates in that
  Organization (`/dashboard/organization/<organizationId>/templates/`). Or Personal Account
  Settings → "Incoming invites" → "Accept" → that Organization's settings. Wrong account: "Sign out and continue" → Log in → the invite.
- **Context switch:** any console page → context switcher ("Switch context") → Personal or
  an Organization → the same page, with that context's Templates and Runs. Also: Account
  Settings → "Your Organizations" → a row ("Select"), and the invite page's "Switch to
  <Organization>". The public shell has no switcher; the public template page acts in the
  active context. When the Organizations fail to load: "Couldn't load your Organizations"
  → "Retry" or "Continue in Personal".
- **Password reset:** Log in → "Forgot password?" → Forgot password → "Send reset link" →
  "Check your inbox…" → email link → Reset password → "Update password" → Log in. An
  expired or reused link: "Reset link expired" → "Request a new link" → Forgot password.
- **Import and export:** sidebar "Import Templates" → Import Templates → "Import
  visibility" → choose a file → Import Preview → "Confirm Import" → "Last Import Result".
  Export everything: "Export Portable Pack" (a download). One Template: Template detail →
  "Template actions" → "Export JSON". On Free: "Upgrade to Pro" → Stripe Checkout.
- **Delete and restore:** My Templates → card actions menu → "Delete" → "Delete template"
  dialog → "Delete" → sidebar "Archive" → Archive → "Restore" → back in My Templates. Runs:
  My Runs → "Run options" → "Delete" → "Delete run" dialog → Archive → "Restore".
- **Browse by category:** Template Library → a category chip or a "Browse by Category"
  tile → Category page → template card → Public template page. Or Categories → a tile or
  row → Category page → "All Categories" in its breadcrumb (or a "Related Categories" chip).
- **Public Profile:** Public template page → owner name → Public Profile → template card →
  Public template page. Signed in: account menu → "Profile" (opens a new tab). An
  Organization's handle opens the Organization Public Profile → template card → Public
  template page. In an Organization with a handle: context switcher → "View Organization
  profile" → its Organization Public Profile.
- **Features:** header "Features" menu → a Feature page → "Browse the Template Library" or
  "See Pricing". Or Home "Explore Features" → Features → a feature card → Feature page →
  "Features" in its breadcrumb → Features.
- **Upgrade and billing:** Pricing → "Upgrade — $9/month" → Stripe Checkout → back →
  Account Settings → Billing → "Manage subscription" → Stripe Customer Portal. Or Account
  Settings → "Upgrade to Pro — $9/month".
- **Stale Runs:** My Runs → "Needs revalidation" chip → "Revalidate". A shared stale Run:
  "Stop sharing to update" → "Revalidate".
- **Run Keys:** Account Settings → Agent Access → "Key name" → "Create Run Key" → "Copy
  key" → "I have saved this key". Revoke: "Revoke" → "Revoke <name>?" → "Revoke key". The
  section shows only where the Run Key UI is enabled.
- **Leave an Organization:** the Organization's settings (not its owner) → "Leave
  Organization" → browser confirm → Personal.
- **Sign out:** account menu → "Sign out" (asks first when the page holds unsaved work) →
  Home.

## Hierarchy and pattern notes

Every page route in `src/app`. The screen names link to their cards.

Shell overlays on every public page: the header's "Templates" and "Features" menus (from `md`
up), the menu sheet below `md` and, signed in, the account menu. On every console page: the
context switcher and the account menu, both in the sidebar, which opens as a sheet below `md`.
Toasts (sonner) report results everywhere.

### Public site

| Path | Screen | Level | Overlays | In-place modes |
| --- | --- | --- | --- | --- |
| `/` | [Home](ui-screen-inventory.md#home) | Root section (brand link) | Shell overlays | Primary button: "Get Started" signed out, "Open Dashboard" signed in |
| `/templates/` | [Template Library](ui-screen-inventory.md#template-library) | Root section (header "Templates" menu and footer "Templates" column: "Template Library"; sidebar "Template Library") | Shell overlays | Search, category filter and sort (Popular, Trending, Recent) kept in the URL; skeleton; empty; catalog error |
| `/categories/` | [Categories](ui-screen-inventory.md#categories) | Root section (header "Templates" menu and footer "Templates" column: "Categories"; sidebar "Categories"; "All Categories" in a category page's breadcrumb) | Shell overlays | Category search, and an empty state with "Clear search" when nothing matches; skeletons; catalog error |
| `/categories/<slug>/` | [Category page](ui-screen-inventory.md#category-page) | Child page of the library and Categories | Shell overlays; sort select | Grid or list; search; sort; skeleton; empty; catalog error; an unknown category shows the 404 view |
| `/features/` | [Features](ui-screen-inventory.md#features) | Child page (Home "Explore Features", "Features" in a feature page's breadcrumb; the header's "Features" menu marks it) | Shell overlays | None |
| `/features/<slug>/` | [Feature page](ui-screen-inventory.md#feature-page) | Root section (header "Features" menu) and child page of Features | Shell overlays | An unknown slug shows the 404 view |
| `/pricing/` | [Pricing](ui-screen-inventory.md#pricing) | Root section (header "Pricing") | Shell overlays | The Pro card's action follows the plan state |
| `/about/` | [About](ui-screen-inventory.md#about) | Root section (footer "About") | Shell overlays | None |
| `/contact/` | [Contact](ui-screen-inventory.md#contact) | Root section (footer "Contact") | Shell overlays | None |
| `/profiles/` | [Profiles](ui-screen-inventory.md#profiles) | Root section (footer "Templates" column: "Profiles") | Shell overlays | People or Organizations tab, and the page, kept in the URL; Previous and Next; loading; load error with Retry; empty ("No people yet", "No Organizations yet"); past the last page ("No more people", "No more Organizations") with "Go to the first page" |
| `/profile/<handle>/` | [Public Profile](ui-screen-inventory.md#public-profile) for a User's handle, [Organization Public Profile](ui-screen-inventory.md#organization-public-profile) for an active Organization's | Child page (owner links, account menu "Profile") | Shell overlays | Loading; error; not found (also an archived Organization); no public Templates |
| `/profile/<handle>/<template>/` | [Public template page](ui-screen-inventory.md#public-template-page), under its Template Owner's handle only | Child page (the library, category pages, Public Profiles, Home) | Shell overlays; Start a Run dialog | Collapsible section previews (all open at first); Required tools list (when the Template has tools); "Save" becomes "Saved"; role-limited actions; Organization error notice; "Start Run" becomes "Continue Run" while a visitor who is not signed in has a guest run in progress; signed in, a notice with "Save to account" while the browser holds a guest run of it |
| `/profile/<handle>/<template>/run/` | [Guest run](ui-screen-inventory.md#guest-run) | Child page of the public template page ("Start Run" signed out, "Continue Run", the breadcrumb back), and a page opened from a plain link | Shell overlays; Run complete dialog; Delete run dialog; Run tasks sheet; Export answers menu; browser confirm | Starts a run when the browser has none; selected task; completed (frozen); task list column at `xl`; "Log in or sign up to save it to your account." signed out, "Save to account" signed in |

### Auth and invites

| Path | Screen | Level | Overlays | In-place modes |
| --- | --- | --- | --- | --- |
| `/login/` | [Log in](ui-screen-inventory.md#log-in) | Child page, auth flow (header "Log in", or a sign-in redirect) | Shell overlays | Verification notice and "Resend verification email"; show or hide password; dev persona buttons outside production |
| `/register/` | [Register](ui-screen-inventory.md#register) | Child page, auth flow (header "Get started") | Shell overlays | Show or hide passwords |
| `/forgot-password/` | [Forgot password](ui-screen-inventory.md#forgot-password) | Child page of Log in | Shell overlays | Form, then "Check your inbox" |
| `/reset-password/` | [Reset password](ui-screen-inventory.md#reset-password) | Flow page from the reset email | Shell overlays | Form, or "Reset link expired" |
| `/team-invites/<token>/` | [Organization invite](ui-screen-inventory.md#organization-invite) | Flow page from the invite link | Shell overlays | Signed out; invite preview; accepted; already a member; declined; wrong account; error |

### Shared runs

| Path | Screen | Level | Overlays | In-place modes |
| --- | --- | --- | --- | --- |
| `/share/<token>/` | [Shared run](ui-screen-inventory.md#shared-run) | Standalone page (no site shell) | Run complete dialog | A completed Run is frozen |

### Signed-in console

| Path | Screen | Level | Overlays | In-place modes |
| --- | --- | --- | --- | --- |
| `/dashboard/templates/` | [My Templates](ui-screen-inventory.md#my-templates) | Root section (sidebar "Templates"; the console home) | Start a Run dialog; Delete template dialog; template actions menu; selects | Grid or list; search; visibility filter; sort |
| `/dashboard/templates/new/` | [Template editor](ui-screen-inventory.md#template-editor) | Child page of My Templates | Template preview dialog; Add Block menu; More actions menu; Outline sheet (below `lg`); browser confirm | Editor panels (Template Settings with its Required tools, Search & SEO, Section Settings, Task Details); collapsible outline sections; Generate from Clipy; kept-draft notices; locked while a create saves |
| `/dashboard/templates/<id>/` | [Template detail](ui-screen-inventory.md#template-detail) | Child page of My Templates | Start a Run dialog; Share link dialog; Delete template dialog; Transfer to Organization dialog; Template actions menu | Visibility switch; Required tools list (when the Template has tools); read-only controls for runners, viewers and other contexts |
| `/dashboard/templates/<id>/edit/` | [Template editor](ui-screen-inventory.md#template-editor) | Child page of Template detail | As on create | As on create, without Clipy; conflict alert; read-only notice |
| `/dashboard/runs/` | [My Runs](ui-screen-inventory.md#my-runs) | Root section (sidebar "Runs"; "View runs" on Template detail adds `?template=<id>`) | Share link dialog; Delete run dialog; Run options menu; Template and status selects | Template filter (in the URL); status filter; search |
| `/dashboard/runs/<id>/` | [Run page](ui-screen-inventory.md#run-page) | Child page of My Runs (its rows link here, and Start Run lands here) | Share link dialog; Run complete dialog; Run tasks sheet; Export answers menu; browser confirm | Rename in place; selected task; completed (frozen); view only; task list column at `xl`; the source Template's Required tools (when the viewer may see that Template) |
| `/dashboard/import-templates/` | [Import Templates](ui-screen-inventory.md#import-templates) | Root section (sidebar "Import Templates") | Visibility select | Import preview; last import result; plan and role notices |
| `/dashboard/archive/` | [Archive](ui-screen-inventory.md#archive) | Root section (sidebar "Archive") | None | Per-list loading, error and empty states; Restore only for roles that may restore |
| `/dashboard/settings/` | [Account Settings](ui-screen-inventory.md#account-settings) | Root section (sidebar "Settings" in Personal, account menu "Settings") | Revoke Run Key dialog | Created Run Key panel; incoming invites |
| `/dashboard/organization/<organizationId>/settings/` | [Organization Settings](ui-screen-inventory.md#organization-settings) | Root section (sidebar "Settings" in that Organization) | Browser confirm; selects | Manager-only controls; Leave Organization for members other than the owner |

Each path above but the Organization's settings always shows Personal, and also exists for an Organization under
`/dashboard/organization/<organizationId>/` (for example
`/dashboard/organization/<organizationId>/runs/<id>/`), with the same screen, level, overlays and
modes in that Organization. Settings is the exception: an Organization's is its own screen,
and Account Settings stays Personal. Until the user's Organizations load, the page shows a
loading state; for an Organization the user cannot open it shows the [404 page](ui-screen-inventory.md#404-page)
in the console shell. The sidebar's Templates, Runs, New Template, Import Templates, Archive and
Settings, the switcher's Settings and every link on the page open the current context's page,
and switching context opens the same section in the chosen context (a Template or Run page
opens the list). A Run, a private Organization Template, and a Run or copy an action just made
open at the URL of the context that owns them; opened at another context's URL, a Template, its
editor or a Run replaces the URL with its owner's.

The sidebar's "Template Library" and "Categories" open `/templates/` and `/categories/`, which
leave the console shell for the public shell.

### System

| Path | Screen | Level | Overlays | In-place modes |
| --- | --- | --- | --- | --- |
| Any unmatched path | [404 page](ui-screen-inventory.md#404-page) | System page (`src/app/not-found.tsx`) | Shell overlays | None |

A signed-in user on an unmatched path under `/dashboard/` sees the 404 in the console shell once
the session check answers; everyone else sees it in the public shell
(`src/components/NotFoundLayout.tsx`).

## Redirect-only paths

- `/dashboard/organization/<organizationId>/` answers 307 with that Organization's Templates.
  Links use `buildConsoleHomePath(context)`.
- `/profile/<creator>/<template>/`, the URL a public Organization Template had under its
  Creator's username, answers 308 with `/profile/<organization handle>/<template>/`, keeping the
  query (the page's own redirect, after its lookup).
- Legacy paths answer 308 with their page: `/checklists` with `/templates/`; `/console` with
  `/dashboard/`; `/account` and `/dashboard/profile` with `/dashboard/settings/`;
  `/console/templates/<id>` with `/dashboard/templates/<id>/`;
  `/console/templates/<id>/edit` with `/dashboard/templates/<id>/edit/`; `/console/runs/<id>`
  and `/run/<id>` (a Run's second address until 2026-09-29) with `/dashboard/runs/<id>/`.
- A page path without its trailing slash, or a file path with one, answers 308 with the
  canonical form. `www.serplists.com` and `*.workers.dev` hosts redirect to the
  environment's one host.
- In the browser, with no redirect status: `/dashboard/` (a spinner) replaces itself with the
  remembered context's My Templates once the user's Organizations confirm it, and Personal's
  when they rule it out (`src/views/DashboardHome.tsx`; a failed list shows "Couldn't load your
  Organizations" there); a Personal URL for a private Organization Template, its editor or an
  Organization Run replaces itself with that Organization's URL, and an Organization URL for
  another owner's Run or private Organization Template with that owner's;
  `/templates/?category=<slug>` with no other
  filter replaces itself with `/categories/<slug>/`; an old ASCII category slug replaces
  itself with the current one; `/profile/<handle>/` in another letter case replaces itself
  with the stored casing.

## Not screens

Route handlers: the API at `/api/*` (`src/app/api/[[...route]]/route.ts`), the sitemap index
at `/sitemap.xml`, its shards at `/sitemaps/static.xml` and `/sitemaps/<kind>/<n>.xml`
(pages, categories, profiles, templates), the legacy `/categories/sitemap.xml` (redirects
to the shards), and `/robots.txt` (`src/app/robots.ts`).
