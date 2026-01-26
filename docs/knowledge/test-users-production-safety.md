# Test users in production

## What happened
- Production had users like `smoke-test+...@serplists.dev` and `mvp-smoke+...@serplists.dev` (plus legacy `@serp-checklists.dev`).
- These were created by smoke/integration flows that registered a new user each run.

## Fix applied
- Integration tests now reuse a single fixed test user instead of creating new ones per run.

## Operational cleanup
- Delete any existing test users in production by email or ID.
- Also delete related rows in `account`, `session`, `templates`, `checklist_runs`, `template_likes`, `usage_analytics`, `entitlement_overrides`, `stripe_customers`, and `stripe_subscriptions`.

## Prevention
- Avoid running test suites against production endpoints.
- Prefer local workers or dedicated staging environments for smoke/e2e.
- Block `@serplists.dev` and legacy `@serp-checklists.dev` test emails from auth endpoints on production.
