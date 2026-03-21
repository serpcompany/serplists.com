# Production schema drift broke save/copy flows (2026-03-21)

## What broke

Production backend writes started failing for core checklist/template actions.

Symptoms reported:

- saving templates/lists failed
- copying public templates failed
- checklist sharing endpoints were at risk of the same failure

## Root cause

The production D1 schema lagged behind the code deployed to Cloudflare Pages.

Missing production columns:

- `templates.version`
- `checklist_runs.is_public`
- `checklist_runs.share_token`
- `checklist_runs.share_expires_at`
- `checklist_runs.share_used_at`

Additional drift found while adding the release guard:

- missing `stripe_customers`
- missing `stripe_subscriptions`
- missing `stripe_webhook_events`

The deployed API already depended on those columns:

- template create/clone writes `version`
- checklist share flows read/write the share columns

## Fix applied

Applied the checked-in live-safe migrations to production D1:

- `db/migrations/0009_stripe_billing.sql`
- `db/migrations/0011_add_template_version.sql`
- `db/migrations/0017_add_checklist_run_sharing_fields.sql`

## Verification

- `pragma table_info(templates)` now includes `version`
- `pragma table_info(checklist_runs)` now includes the sharing columns
- production site still rendered successfully after the migration work

## Prevention

- Add a release check that compares production D1 columns against the schema expected by the deployed API
- Do not treat a successful frontend deploy as complete until required production migrations have been applied
