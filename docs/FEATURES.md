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
