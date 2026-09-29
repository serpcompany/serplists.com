# UI app map

Phase 1 of the UI runbook for the web app: every screen, the flows that connect them, and
how each page is reached. The [UI screen inventory](ui-screen-inventory.md) holds a spec card
for each screen and overlay (phases 2 and 3). The design reference is
https://aiuxplayground.com/.

Paths are canonical: a page ends in a slash ([URL standard](../FRONTEND.md#urls)). `<user>`,
`<template>`, `<id>`, `<slug>` and `<token>` stand for route parameters. Quoted words are
the labels the app shows. Product terms follow [PRODUCT_SENSE.md](../PRODUCT_SENSE.md).

## Shells

`src/components/Layout.tsx` picks the shell from the path (`resolveRouteShell` in
`src/lib/routes.ts`).

- **Public shell:** site header and site footer. Every page in the `(site)` route group, and
  the 404 page on public paths.
- **Console shell:** the console sidebar (shadcn's Sidebar block, a sheet on phones), a top
  bar with the sidebar trigger and the site links, and the site footer. Every page under
  `/dashboard/`. These pages sit in the `(app)` route group, which checks the session first:
  a signed-out visitor goes to `/login/?next=<path>`.
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
- **Sheet:** a panel that slides in from a screen edge (phone menus, the Run task list).
- **Dropdown menu or popover:** a menu anchored to its trigger (account menu, context
  switcher, action menus, selects, Add Block).
- **In-place state:** the page changes without a navigation (tabs of a panel, grid or list,
  filters, collapsible sections, loading, empty and error states).
- **Browser confirm:** the browser's own `confirm()` prompt (unsaved changes, leaving an
  Organization).

## Main areas

- **Public site:** Home, the template library, Categories, Features, Pricing, About, Contact.
- **Auth:** Log in, Register, Forgot password, Reset password.
- **Public Profiles and Public Templates:** `/profile/<user>/` and
  `/profile/<user>/<template>/`.
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

- **First visit to a first Run:** Home → "Browse Templates" → Template library → template
  card → Public template page → "Start Run" → Log in (the template page is the return path)
  → "Sign up" → Register → "Create account" → Log in ("Verify your email first, then sign
  in.") → verification email link → Log in ("Email verified. You can sign in now.") → "Sign
  in" → Public template page → "Start Run" → Run page (`/dashboard/runs/<id>/`). When no
  email verification is required, Register returns straight to the template page.
- **First visit from the header:** any public page → "Get started" → Register → "Create
  account" → My Templates. With email verification: → Log in → email link → "Sign in" →
  My Templates (a sign-in with no return path opens the console home).
- **Returning user:** Home → "Log in" → Log in → "Sign in" → My Templates. Signed in: Home →
  "Open Dashboard" → My Templates, or account menu → "My Templates". A bookmarked
  `/dashboard/` redirects to My Templates. A console link opened while signed out → Log in
  (`?next=<path>`) → "Sign in" → that page.
- **Create a Template:** My Templates → "New Template" (page header or sidebar) → Template
  editor → Template Settings fields → outline "Add section" and "Add task to <section>" →
  Task Details → "Add Block" → "Save" → My Templates. On a new Template, "Generate from Clipy"
  → "Generate draft" fills the form first. At the plan's Template limit: "Save" → notice
  → "Upgrade to Pro" → Stripe Checkout → back → "Restore draft" → "Save".
- **Edit a Template:** My Templates → card actions menu → "Edit" (or the list row's "Edit")
  → Template editor → "Save" (stays, with a toast) → back arrow → My Templates. From the
  detail page: My Templates → title → Template detail → "Edit" → Template editor. Another
  save came first: "Save" → "Error" alert → "Load latest version".
- **Run a checklist, complete it, share it:** My Templates → "Start Run" (card hover, card
  actions menu or list row) → Start Run dialog → "Start Run" → Run page → task checkbox or
  "Mark Complete" → "Next Task" → … → last task done → "Checklist Completed!" dialog →
  "Return to Dashboard" (completes the Run) → My Runs. From Template detail: "Start Run" →
  "Name Your Checklist Run" dialog → "Start Checklist" → Run page. Share: Run page "Share"
  (or My Runs → "Run options" → "Share Run") → Share run dialog → copy the link. Guest:
  Shared run → tick tasks, add notes → "Complete run" → "Checklist Completed!" → "Return to
  Public Runs" → Template library.
- **Duplicate a Template:** Template detail → "Template actions" → "Duplicate" → Template
  detail of the copy ("Template duplicated"). Someone else's Public Template: "Copy to My
  Templates" (or "Copy to Organization") → Template detail of the copy.
- **Save a Public Template:** Public template page → "Save" or "Copy to Library" → Template
  detail of the new copy. Signed out: → Log in → back → "Save". Free in Personal: "Upgrade
  to save" → Stripe Checkout.
- **Publish a Template:** Template detail → "Share" → Share Template dialog (the
  `/profile/<user>/<template>/` link) → copy. Or the "Visibility" switch in Details. No
  username yet: a toast asks for one → Account Settings → "Username" → "Update Profile".
- **Organization invite:** manager: Account Settings → Organizations → "Invite email" and
  "Role" → "Create link" → copy the invite link and send it. Invitee: Organization invite
  → signed out: "Log in to accept" (or "Create an account") → Log in → back to the invite →
  "Accept invite" → "Invite accepted." → "Switch to <Organization>" → My Templates in that
  Organization. Or Account Settings → "Incoming invites" → "Accept". Wrong account: "Sign
  out and continue" → Log in → the invite.
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
- **Browse by category:** Template library → a category chip or a "Browse by Category"
  tile → Category page → template card → Public template page. Or Categories → a tile or
  row → Category page.
- **Public Profile:** Public template page → owner name → Public Profile → template card →
  Public template page. Signed in: account menu → "Profile" (opens a new tab).
- **Features:** header "Features" → Features → feature card → Feature page → "Browse
  Templates" or "See Pricing".
- **Upgrade and billing:** Pricing → "Upgrade — $9/month" → Stripe Checkout → back →
  Account Settings → Billing → "Manage subscription" → Stripe Customer Portal. Or Account
  Settings → "Upgrade to Pro — $9/month".
- **Stale Runs:** My Runs → "Needs revalidation" chip → "Revalidate". A shared stale Run:
  "Stop sharing to update" → "Revalidate".
- **Run Keys:** Account Settings → Agent Access → "Key name" → "Create Run Key" → "Copy
  key" → "I have saved this key". Revoke: "Revoke" → "Revoke <name>?" → "Revoke key". The
  section shows only where the Run Key UI is enabled.
- **Leave an Organization:** Account Settings in an Organization (not its owner) → "Leave
  Organization" → browser confirm → Personal.
- **Sign out:** account menu → "Sign out" (asks first when the page holds unsaved work) →
  Home.

## Hierarchy and pattern notes

Every page route in `src/app`. The screen names link to their cards.

Shell overlays on every public page: the menu sheet below `md` and, signed in, the account
menu. On every console page: the context switcher and the account menu, both in the sidebar,
which opens as a sheet below `md`. Toasts (sonner) report results everywhere.

### Public site

| Path | Screen | Level | Overlays | In-place modes |
| --- | --- | --- | --- | --- |
| `/` | [Home](ui-screen-inventory.md#home) | Root section (brand link) | Shell overlays | Primary button: "Get Started" signed out, "Open Dashboard" signed in |
| `/templates/` | [Template library](ui-screen-inventory.md#template-library) | Root section (header "Templates", sidebar "Discover") | Shell overlays | Search, category filter and sort (Popular, Trending, Recent) kept in the URL; skeleton; empty; catalog error |
| `/categories/` | [Categories](ui-screen-inventory.md#categories) | Child page (a category page's "All Categories"; the console's "Categories") | Shell overlays | Category search; skeletons; catalog error |
| `/categories/<slug>/` | [Category page](ui-screen-inventory.md#category-page) | Child page of the library and Categories | Shell overlays; sort select | Grid or list; search; sort; skeleton; empty; catalog error; an unknown category shows the 404 view |
| `/features/` | [Features](ui-screen-inventory.md#features) | Root section (header "Features") | Shell overlays | None |
| `/features/<slug>/` | [Feature page](ui-screen-inventory.md#feature-page) | Child page of Features | Shell overlays | An unknown slug shows the 404 view |
| `/pricing/` | [Pricing](ui-screen-inventory.md#pricing) | Root section (header "Pricing") | Shell overlays | The Pro card's action follows the plan state |
| `/about/` | [About](ui-screen-inventory.md#about) | Root section (footer "About") | Shell overlays | None |
| `/contact/` | [Contact](ui-screen-inventory.md#contact) | Root section (footer "Contact") | Shell overlays | None |
| `/profile/<user>/` | [Public Profile](ui-screen-inventory.md#public-profile) | Child page (owner links, account menu "Profile") | Shell overlays | Loading; error; not found; no public Templates |
| `/profile/<user>/<template>/` | [Public template page](ui-screen-inventory.md#public-template-page) | Child page (the library, category pages, Public Profiles, Home) | Shell overlays | Collapsible section previews (all open at first); "Save" becomes "Saved"; role-limited actions; Organization error notice |

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
| `/dashboard/templates/` | [My Templates](ui-screen-inventory.md#my-templates) | Root section (sidebar "Templates"; the console home) | Start Run dialog; Delete template dialog; template actions menu; selects | Grid or list; search; visibility filter; sort |
| `/dashboard/templates/new/` | [Template editor](ui-screen-inventory.md#template-editor) | Child page of My Templates | Template preview dialog; Add Block popover; More actions menu; browser confirm | Editor panels (Template Settings, Search & SEO, Section Settings, Task Details); collapsible outline sections; Generate from Clipy; kept-draft notices; locked while a create saves |
| `/dashboard/templates/<id>/` | [Template detail](ui-screen-inventory.md#template-detail) | Child page of My Templates | Run name dialog; Share link dialog; Delete template dialog; Template actions menu | Visibility switch; read-only controls for runners, viewers and other contexts |
| `/dashboard/templates/<id>/edit/` | [Template editor](ui-screen-inventory.md#template-editor) | Child page of Template detail | As on create | As on create, without Clipy; conflict alert; read-only notice |
| `/dashboard/runs/` | [My Runs](ui-screen-inventory.md#my-runs) | Root section (sidebar "Runs") | Share link dialog; Delete run dialog; Run options menu; status select | Status filter; search |
| `/dashboard/runs/<id>/` | [Run page](ui-screen-inventory.md#run-page) | Child page of My Runs (its rows link here, and Start Run lands here) | Share link dialog; Run complete dialog; Run tasks sheet; browser confirm | Rename in place; selected task; completed (frozen); view only; task list column at `xl` |
| `/dashboard/import-templates/` | [Import Templates](ui-screen-inventory.md#import-templates) | Root section (sidebar "Import Templates") | Visibility select | Import preview; last import result; plan and role notices |
| `/dashboard/archive/` | [Archive](ui-screen-inventory.md#archive) | Root section (sidebar "Archive") | None | Per-list loading, error and empty states; Restore only for roles that may restore |
| `/dashboard/settings/` | [Account Settings](ui-screen-inventory.md#account-settings) | Root section (sidebar "Settings", account menu "Settings") | Revoke Run Key dialog; browser confirm; selects | Personal or Organization context; manager-only Organization controls; created Run Key panel |

The sidebar's "Discover" and "Categories" open `/templates/` and `/categories/`, which leave
the console shell for the public shell.

### System

| Path | Screen | Level | Overlays | In-place modes |
| --- | --- | --- | --- | --- |
| Any unmatched path | [404 page](ui-screen-inventory.md#404-page) | System page (`src/app/not-found.tsx`) | Shell overlays | None |

An unmatched path under `/dashboard/` gets the console shell, because the shell follows the
path (see the inventory's [open questions](ui-screen-inventory.md#open-questions)).

## Redirect-only paths

- `/dashboard/` is not a page: it answers 307 with `/dashboard/templates/`, the console
  home. Links use `buildConsoleHomePath()` instead.
- Legacy paths answer 308 with their page: `/checklists` with `/templates/`; `/console` with
  `/dashboard/templates/`; `/account` and `/dashboard/profile` with `/dashboard/settings/`;
  `/console/templates/<id>` with `/dashboard/templates/<id>/`;
  `/console/templates/<id>/edit` with `/dashboard/templates/<id>/edit/`; `/console/runs/<id>`
  and `/run/<id>` (a Run's second address until 2026-09-29) with `/dashboard/runs/<id>/`.
- A page path without its trailing slash, or a file path with one, answers 308 with the
  canonical form. `www.serplists.com` and `*.workers.dev` hosts redirect to the
  environment's one host.
- In the browser, with no redirect status: `/templates/?category=<slug>` with no other
  filter replaces itself with `/categories/<slug>/`; an old ASCII category slug replaces
  itself with the current one; `/profile/<user>/` in another letter case replaces itself
  with the stored casing.

## Not screens

Route handlers: the API at `/api/*` (`src/app/api/[[...route]]/route.ts`), the sitemap index
at `/sitemap.xml`, its shards at `/sitemaps/static.xml` and `/sitemaps/<kind>/<n>.xml`
(pages, categories, profiles, templates), the legacy `/categories/sitemap.xml` (redirects
to the shards), and `/robots.txt` (`src/app/robots.ts`).
