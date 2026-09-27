# Design Docs

How the system is designed and operated. Every design doc is listed here with its
status and the date its content was last checked against the code. `pnpm run
docs:check` fails if a doc is missing from this table.

Statuses: **current** (describes the code today), **accepted** (a decision in
force), **historical** (kept for context; superseded), **draft** (proposal).

| Doc | Status | Last verified | Summary |
| --- | --- | --- | --- |
| [Core beliefs](core-beliefs.md) | current | 2026-09-27 | Operating beliefs and the enforced rules every change follows |
| [Personal and Organization contexts](personal-and-organization-contexts.md) | accepted | 2026-09-19 | Why ownership is Personal or Organization, and how console routes follow context |
| [System overview](system-overview.md) | current | 2026-09-19 | Components, request flow, UI and API routes, data model, authorization |
| [Data persistence](data-persistence.md) | current | 2026-09-19 | D1 tables, JSON columns, resource ownership, caching, import/export |
| [Database operations](database-operations.md) | current | 2026-09-27 | Environments, migrations, seeds, release checklists, backups, R2 |
| [Authentication and accounts](authentication.md) | current | 2026-09-27 | Better Auth integration, auth contract, verification, troubleshooting |
| [Organizations](organizations.md) | current | 2026-09-19 | Roles, data model, API routes, invites, audit history |
| [Billing](billing.md) | current | 2026-09-25 | Stripe setup, portal, webhooks, local and production verification |
| [Template content types](template-content-types.md) | current | 2026-09-27 | Adding a checklist content type or editor tab |
| [Development environment](development-environment.md) | current | 2026-09-27 | Setup, running, signing in, UI snapshots, logs, local D1, tests |
| [Agent workflow](agent-workflow.md) | current | 2026-09-27 | Issue to merge, triage labels, weekly maintenance, admin settings |
| [UI-service decoupling audit](ui-service-decoupling-audit.md) | historical | 2026-04-10 | Point-in-time audit; progress lives in the [UI decoupling plan](../exec-plans/active/ui-decoupling.md) |
