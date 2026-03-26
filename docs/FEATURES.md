# Features

## Template behavior updates

- **Template update propagation to existing runs**
  - When a logged-in user updates a template's sections/items, those changes now propagate to all related checklist runs for that user (`template_id` matches).
  - This is implemented in `PUT /api/templates/:id` so existing runs are now updated immediately when template content changes.
  - The update message shown in UI (`Template updated successfully - all related runs have been updated`) now reflects backend behavior.

## Logged-in navigation and dashboard convenience

- **Quick access to templates and runs**
  - Logged-in users now get a secondary nav under the main header with direct links to:
    - `Templates` (`/console/templates`)
    - `Runs` (`/console/runs`)
  - The Dashboard page now includes a **New Run** action so users can start a run flow without hunting through extra navigation.
  - The Console still preserves the existing **New Template** action and now gives immediate access to template-backed run creation from `/console/templates`.

## Guest checklist sharing

- **Run-level checklist sharing**
  - The Templates page now uses a **Run** action to immediately create a checklist run.
  - New runs can be shared from the run page using the **Share** button, which creates a public `/share/:token` link for that specific run.
  - Each share action now generates a new share token for the current run and updates that same run's share attachment instead of reusing template-level shares.
  - Guests can open a run share URL without logging in and complete the checklist.
  - Shared runs remain read-only for title editing and destructive actions while still allowing progress updates.
  - This is the current product version of the older "temporary checklist" idea:
    - users create a one-off run from a template
    - users share that run to a guest
    - the guest completes the shared run without needing an account
  - Current gating is plan-limit based through active-run limits, not a separate premium-only guest-share flag.

## Non-edit template detail view

- **Console template preview page**
  - `/console/templates/:id` resolves to a read-only template detail view instead of the editor.
  - `/console/templates/:id/edit` remains the editor route.
  - Template cards and dashboard template links now open the detail view first.
  - The detail page renders template content and provides actions for:
    - **Edit** (navigates to `/console/templates/:id/edit`)
    - **Share** (copies a public `/profile/{username}/{templateSlug}` template URL and marks the template as public if needed)
    - **Start Run** (creates a checklist run and opens `/console/runs/:id`)
    - **Archive** (deletes the template and returns to `/console/templates`)
  - Guests or other users can copy the shared template into their account from `/profile/{username}/{templateSlug}` using **Copy to My Templates**.
  - If they hit plan limits, they are prompted to upgrade to continue saving templates.

## Shared template copying

- **Public shared templates now expose the copy CTA**
  - All users opening a public shared template at `/profile/{username}/{templateSlug}` now see a copy CTA.
  - Guests are prompted to log in before they can copy a shared template.
  - Logged-in Free users are prompted to upgrade to Pro before they can copy a shared template.
  - Logged-in Pro users can copy the shared template into their account.
  - The `/console/templates/:id` detail view uses the same copy gating for non-owners so the public and private detail routes stay consistent.

## Dev test-user plans

- **Local personas now match their labels**
  - `Admin (Pro)` and `Jane (Pro)` are treated as Pro in local development.
  - `John (Free)` and `Bob (Free)` remain Free.
  - The local seed data now inserts entitlement overrides for the two Pro personas.

## Auth, session, and entitlement behavior

- **Better Auth is the canonical auth/session layer**
  - Email sign-in, sign-up, sign-out, cookie session lookup, password changes, session revocation, password reset, and email verification are all handled through Better Auth.
  - The app treats the Better Auth cookie session as the only supported login state for normal user flows.
- **Protected routes preserve the requested destination**
  - If a logged-out user opens a protected route like `/console/templates`, `/console`, `/console/runs/:id`, or `/account`, they are redirected to `/login`.
  - After successful sign-in, they are returned to the original protected route they asked for instead of being dropped on a generic default page.
- **Email verification and password reset fail clearly when email delivery is unavailable**
  - Sign-up requires email verification before the user can sign in.
  - Password reset and resend-verification flows depend on a configured auth email provider (`RESEND_API_KEY` or `USESEND_API_KEY`).
  - If auth email delivery is not configured, the API now returns an explicit `503 auth_email_unavailable` response instead of surfacing a generic server failure.
- **Plan enforcement stays app-specific**
  - Unauthenticated access returns `401 Unauthorized`.
  - Logged-in Free users who hit Pro-only or plan-limited actions receive `403` responses with product-specific upgrade or limit messaging such as `upgrade_required` or `limit_reached`.
  - Logged-in users only see one auth/upgrade contract on premium surfaces:
    - `401` sends them to `/login` and preserves the page they were trying to use.
    - `403 upgrade_required` or `403 limit_reached` sends them into the Pro checkout flow.
    - `503 billing_unavailable` shows an explicit billing-unavailable message instead of a generic failure.
  - Public template copy (`/profile/{username}/{templateSlug}`), template detail copy (`/console/templates/:id` for non-owners), and template import/export all use that same contract.
  - The client now preserves API `status`, `code`, and `details` instead of guessing behavior from error-message text.
