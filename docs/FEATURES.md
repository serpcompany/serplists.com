# Features

## Template behavior updates

- **Template update propagation to existing runs**
  - When a logged-in user updates a template's sections/items, those changes now propagate to all related checklist runs for that user (`template_id` matches).
  - This is implemented in `PUT /api/templates/:id` so existing runs are now updated immediately when template content changes.
  - The update message shown in UI (`Template updated successfully - all related runs have been updated`) now reflects backend behavior.

## Logged-in navigation and dashboard convenience

- **Quick access to templates and runs**
  - Logged-in users now get a secondary nav under the main header with direct links to:
    - `Templates` (`/templates`)
    - `Runs` (`/dashboard`)
  - The Dashboard page now includes a **New Run** action so users can start a run flow without hunting through extra navigation.
  - Dashboard still preserves the existing **New Template** action and now gives immediate access to template-backed run creation from `/templates`.

## Guest checklist sharing

- **Run-level checklist sharing**
  - The Templates page now uses a **Run** action to immediately create a checklist run.
  - New runs can be shared from the run page using the **Share** button, which creates a public `/run/shared/:token` link for that specific run.
  - Each share action now generates a new share token for the current run and updates that same run's share attachment instead of reusing template-level shares.
  - Guests can open a run share URL without logging in and complete the checklist.
  - Shared runs remain read-only for title editing and destructive actions while still allowing progress updates.

## Non-edit template detail view

- **Template preview page at `/templates/:id`**
  - `/templates/:id` now resolves to a read-only template detail view instead of the editor.
  - `/templates/:id/edit` remains the editor route.
  - Template cards and dashboard template links now open the detail view first.
  - The detail page renders template content and provides actions for:
    - **Edit** (navigates to `/templates/:id/edit`)
    - **Share** (copies a public `/checklists/{slug-or-id}` template URL and marks the template as public if needed)
    - **Start Run** (creates a checklist run and opens `/run/:id`)
    - **Archive** (deletes the template and returns to `/templates`)
  - Guests or other users can copy the shared template into their account from `/checklists/:slug` using **Copy to My Templates**.
  - If they hit plan limits, they are prompted to upgrade to continue saving templates.

## Shared template copying

- **Public shared templates now expose the copy CTA**
  - All users opening a public shared template at `/checklists/:slug` now see a copy CTA.
  - Guests are prompted to log in before they can copy a shared template.
  - Logged-in Free users are prompted to upgrade to Pro before they can copy a shared template.
  - Logged-in Pro users can copy the shared template into their account.
  - The `/templates/:id` detail view uses the same copy gating for non-owners so the public and private detail routes stay consistent.

## Dev test-user plans

- **Local personas now match their labels**
  - `Admin (Pro)` and `Jane (Pro)` are treated as Pro in local development.
  - `John (Free)` and `Bob (Free)` remain Free.
  - The local seed data now inserts entitlement overrides for the two Pro personas.

## MVP navigation scope

- **Recipes hidden from navigation for now**
  - The `/recipes` route remains in the app, but Recipes is temporarily hidden from the header, mobile nav, and footer while it is out of MVP scope.
  - This keeps navigation focused on active MVP areas like templates, runs, pricing, and public checklists.
