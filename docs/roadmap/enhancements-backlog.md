# Enhancements and Improvements

This list reflects verified limitations and cleanup opportunities based on the current code.

## Security and auth
- Auth is cookie-based (httpOnly) via Better Auth. Consider adding a dedicated password change UI and session management UI if needed.

## API and data
- `TemplatesContext` has a stubbed `userTemplates` query that always returns an empty array. A user-specific endpoint could replace it.

## Logging and analytics
- `src/lib/analytics.ts` stores events in memory and only logs to the console. There is no persistence or backend sink.

## Pricing and plans
- Defer `basic` tier work until after MVP launch. Launch scope is `Free` + `Pro`, with broader multi-tier billing architecture tracked separately from the launch checklist.

## Code cleanup
- `src/lib/api/client.ts` is unused by the app.
- Keep `db/schema.sql` aligned with `db/migrations/` to avoid drift.
