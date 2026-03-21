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
