# UI Feature Audit and Screen Inventory (2026-04-09)

Purpose: establish the actual app surface before the UI refactor so we know which screens exist, what each one does, which interactions matter, and where the highest regression risk sits.

This audit is based on the current router and page/component code in `src/App.tsx`, `src/lib/routes.ts`, `src/pages/*`, and the shared UI shells/components used by those routes.

## Surface summary

### Route buckets

- `Auth`: `/login`, `/register`, `/forgot-password`, `/reset-password`
- `Public discovery`: `/templates`, `/categories`, `/categories/:categorySlug`, `/profile/:username`
- `Public detail + shared execution`: `/profile/:username/:templateSlug`, `/share/:shareToken`
- `Private console`: `/dashboard`, `/dashboard/runs`, `/dashboard/runs/:id`, `/dashboard/templates`, `/dashboard/templates/:id`, `/dashboard/templates/:id/edit`, `/dashboard/templates/new`, `/account`

### Complexity tiers

- `Low interaction`: register, forgot password, reset password, categories, profile index
- `Medium interaction`: login, template library, dashboard home/runs, templates index, template detail, public template detail
- `High interaction`: checklist run, template editor, account

### Cross-route contracts that the refactor must preserve

- Auth-protected routes redirect to `/login` and should preserve the requested destination.
- Public template flows and console template detail flows share the same copy/save entitlement contract.
- Template-to-run creation appears in multiple places and always ends in `/dashboard/runs/:id`.
- Shared runs at `/share/:shareToken` reuse the run UI but must stay guest-accessible and restrict private-only actions.
- Billing and entitlement checks appear in account, public template copy, and console template copy/share flows.

## Shared shells and reusable UI patterns

### `Layout`

- Public shell: header nav, mobile nav sheet, footer groups, brand link, account menu when authenticated.
- Console shell: left sidebar nav, search input placeholder, account menu, shared page container.
- Route shell is determined from pathname by `resolveRouteShell`, `resolvePublicRouteTier`, and `resolveConsoleSection`.

### `AuthPageShell`

- Shared auth layout for login, register, forgot password, and reset password.
- Main card: title, description, form body, footer links.
- Secondary panel on desktop: static “what happens after sign in” explanation.

### Repeated interaction patterns

- Toast feedback for success/error on nearly every async action.
- Dialogs for confirmation and naming flows: run creation, run completion, template delete/archive.
- Inline editing for run titles and editor sidebar labels.
- Shared public content rendering through `PublicTemplateContent`.
- Shared checklist task-detail rendering through `ChecklistContent`.

## Route matrix

### `/login`

- Purpose: sign in and return the user to the originally requested protected route.
- Main sections: auth shell, optional dev-only quick-fill panel, sign-in form, resend verification affordance, footer link to register.
- Core actions: enter email/password, submit login, resend verification email, move to register or forgot password.
- States: loading auth session, submitting, resending verification, unverified-email state, already-authenticated redirect.
- Special behavior: reads query params for prefilled email, `verify_email=1`, and `verified=1`; in development it exposes persona quick-fill controls.
- Dependencies: `useAuth`, `authClient`, auth status check for email delivery.

### `/register`

- Purpose: create an account and start the email-verification flow.
- Main sections: auth shell, registration form, footer link to login.
- Core actions: enter name/email/password/confirm password, submit registration.
- States: submitting, password mismatch, password policy failure, auth email unavailable, success with verification redirect.
- Special behavior: if verification is required, redirects to `/login?verify_email=1&email=...`; otherwise sends the user to the console home.

### `/forgot-password`

- Purpose: request a password-reset email.
- Main sections: auth shell, request form or post-submit confirmation message.
- Core actions: enter email, submit reset request, move back to login.
- States: submitting, email service unavailable, request complete.
- Special behavior: reset email callback targets `/reset-password`.

### `/reset-password`

- Purpose: redeem a password reset token and set a new password.
- Main sections: auth shell, reset form, expired-link fallback state.
- Core actions: enter new password, confirm password, submit, return to login.
- States: missing token, expired token via query param, submitting, password policy failure, success redirect to login.

### `/templates`

- Purpose: browse the public template library.
- Main sections: hero/introduction block, compact search/filter toolbar, result grid/list, empty state, optional library summary footer.
- Core actions: search, switch grid/list view, multi-select categories, clear filters, open template cards, jump to category pages, jump to creator profiles.
- States: loading skeleton, empty results, category-filtered variant, template-type variant when reused by recipes.
- Shared components: `SearchAndFilters`, `TemplateCard`, `PublicPageContainer`.
- Important interactions: card click opens canonical public template path; category pills override card click and navigate to category pages.

### `/categories`

- Purpose: browse category buckets derived from public templates.
- Main sections: hero, category stats line, category card grid, empty state.
- Core actions: open a category route from a card.
- States: loading skeleton, no categories found.
- Data behavior: categories are derived client-side from public templates already loaded in context.

### `/categories/:categorySlug`

- Purpose: library view filtered to one category.
- Main sections: same as `/templates`, with category-specific copy and a “back to all templates” pill.
- Core actions: same as `/templates`.
- States: slug-to-category resolution, empty results for a specific category.

### `/profile/:username`

- Purpose: public profile page for a creator plus their public templates.
- Main sections: back link, profile hero, creator stats, template cards/listing, sidebar details, empty state.
- Core actions: open template detail pages, open category pages, copy profile link, move back to library.
- States: loading, profile not found/error, repo-backed profile merge variant for official content.
- Data behavior: fetches public profile and public templates, then merges repo-backed templates when the owner is the official `serp` profile.

### `/profile/:username/:templateSlug`

- Purpose: public template detail with copy/save and start-run entry points.
- Main sections: top action row, metadata header, mobile “more details” disclosure, main template content, desktop sidebar with section links and metadata.
- Core actions: start checklist run, copy/save template to account, navigate to owner profile, navigate to category pages, in-page jump links to sections.
- States: loading, not found, billing-status loading, authenticated vs unauthenticated copy CTA variants, Pro vs Free copy CTA variants, saving/copying, starting run.
- Gating: unauthenticated users are sent to login with a return path; non-Pro users are routed into billing checkout before copy.
- Shared components: `PublicTemplateView`, `PublicTemplateContent`.
- Important contract: this route is one of the primary entitlement surfaces and must keep its auth/upgrade behavior aligned with console template copy behavior.

### `/share/:shareToken`

- Purpose: guest-accessible execution view for a specific checklist run.
- Main sections: run header with status/progress, left task outline, right task detail panel, completion dialog.
- Core actions: select task, toggle task completion, toggle sub-item completion, create share link is hidden here, finish the run.
- States: loading, run not found, in-progress vs completed, completion dialog when the final item is checked.
- Restrictions: shared runs cannot edit the title and do not show the private share action.
- Data behavior: fetches shared checklist through the share token and persists updates through the shared-checklist API.

### `/dashboard`

- Purpose: console home and overview surface for active and completed runs, with a preview of owned templates.
- Main sections: summary metrics, active/completed runs list, template section, delete-run dialog.
- Core actions: continue a run, view completed run, inline-edit run title, delete run, create template, open template detail.
- States: route variant for `/dashboard` vs `/dashboard/runs`, loading spinners, empty active/completed run states, title-edit mode.
- Shared components: `UserTemplatesSection`, run cards, progress bars.

### `/dashboard/runs`

- Purpose: same dashboard component, but focused on the runs section via route context.
- Main sections: same as `/dashboard`, with route section logic marking the runs navigation state.
- Core actions: same as `/dashboard`.
- Refactor note: this is not a separate page implementation; it is a route alias into the same screen-level component and should likely remain behaviorally aligned.

### `/dashboard/runs/:id`

- Purpose: private execution view for a checklist run.
- Main sections: run header with back button/title/progress/share, left task outline, right task detail panel, completion dialog.
- Core actions: select task, toggle task completion, toggle sub-item completion, inline-edit run title, create a share link, complete the run.
- States: loading, run not found, editing-title mode, in-progress vs completed, completion dialog.
- Data behavior: prefers context data, falls back to API fetch by run id; recomputes progress from sections/sub-items; updates local run state through context.
- Important interaction details:
- checking an item also checks all sub-items
- sub-item completion can auto-complete or un-complete the parent item
- first incomplete task is auto-selected on load

### `/dashboard/templates`

- Purpose: manage owned templates and start new runs from them.
- Main sections: summary hero, template metrics, `My Templates` list, import/export panel, run-name dialog.
- Core actions: create template, browse public templates, open template detail, delete template, start run, import/export template packs.
- States: loading templates, empty owned-template state, run-creation modal state.
- Shared components: `UserTemplatesSection`, `TemplateBackup`, `RunNameDialog`.

### `/dashboard/templates/:id`

- Purpose: read-only console template detail for owners and non-owners.
- Main sections: back link, template header, action row, category chips, template content, run-name dialog, archive confirmation dialog.
- Owner actions: edit, share, start run, archive.
- Non-owner actions: copy to account, start run, log in to copy when signed out.
- States: loading, not found, billing-status loading, copying, sharing, deleting, run-dialog open.
- Gating: non-owner copy uses the same login and Pro/billing checks as the public template route.
- Important behavior: share may first force the template public, then copy the canonical public URL; share fails if the owner lacks a username.

### `/dashboard/templates/new`

- Purpose: create a new template from scratch.
- Main sections: sticky editor header, left section/task outline, center editing surface, form-level error/loading handling.
- Core actions: save, cancel, add/remove sections, add/remove tasks, edit section titles, edit task titles, edit template metadata, edit SEO metadata, toggle public/private, manage categories/tags, edit task content.
- States: initial blank template, save in progress, validation errors, sidebar selection state, template-info mode, SEO mode, section mode, task mode.
- Shared components: `TemplateHeader`, `TemplateBasicInfo`, `SEOMetaEditor`, `SectionSidebar`, `SectionEditor`, `ItemEditor`.
- Important interaction details:
- double-click in the sidebar enables inline editing for sections/tasks
- section/task removal happens inline from the outline
- metadata and SEO are separate editor modes from section/task editing

### `/dashboard/templates/:id/edit`

- Purpose: edit an existing template using the same editor shell as the create route.
- Main sections: same as new-template editor.
- Core actions: same as create route.
- States: loading existing template, load error alert, existing slug/public data prefilled into the form.
- Important behavior: loads from context first, then falls back to the template API.

### `/account`

- Purpose: manage profile, billing, and security.
- Main sections: profile header, `ProfileSection`, `BillingSection`, `SecuritySection`.
- Core actions:
- upload/change avatar
- edit full name
- edit username
- save profile
- open public profile link
- start billing checkout or billing portal
- change password
- optionally revoke other sessions while changing password
- revoke other sessions directly
- States: profile loading/saving, billing query loading/error/unavailable, password-update loading, revoke-sessions loading, billing success/cancel toast from query params.
- Important constraints:
- email is read-only
- username input strips non-alphanumeric characters
- public profile URL preview depends on username being present

## Refactor implications

### Highest-risk screens

- `ChecklistRun`: dense interaction surface, derived progress rules, shared/private mode split, inline title editing, share flow, completion flow.
- `TemplateEditor`: multi-pane editing shell, heavy local form state, nested arrays, multiple editing modes, inline sidebar editing.
- `TemplateDetail` and `PublicTemplate`: entitlement-sensitive actions with overlapping behavior that should stay consistent.
- `Account`: mixes three distinct domains on one screen: profile, billing, security.

### Shared patterns worth systemizing

- Route-level loading and not-found treatments.
- Action bars for detail pages with CTA states like `checking`, `saving`, `copying`, `starting`.
- Reusable list/detail shell for run execution and possibly editor/detail flows.
- Consistent async feedback patterns for toasts, dialogs, and optimistic vs non-optimistic actions.
- Shared entitlement CTA model for `login required`, `checking plan`, `upgrade required`, `billing unavailable`.

### Candidate simplifications for the refactor

- Unify template-detail action logic so public and console surfaces do not drift.
- Separate console home and runs into clearer page-level responsibilities if the current shared component keeps growing.
- Formalize a reusable route spec for “content page”, “catalog page”, “detail page”, and “workflow page”.
- Reduce mixed page responsibilities where a screen currently acts as both dashboard and CRUD launcher.

## Route aliases and implementation notes

- `/dashboard` and `/dashboard/runs` both render `Dashboard`.
- `/dashboard/templates/new` and `/dashboard/templates/:id/edit` both render `TemplateEditor`.
- Legacy console aliases still exist for `/console`, `/console/templates/:id`, `/console/templates/:id/edit`, and `/console/runs/:id`.
- The current refactor should treat canonical `/dashboard*` routes as the main target while preserving the behavior of these aliases until route cleanup is explicitly scheduled.
