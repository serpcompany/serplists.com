# Enhancements and Improvements

This list reflects verified limitations and cleanup opportunities based on the current code.

## Security and auth
- JWT tokens are stored in `localStorage` (`src/lib/api.ts`, `src/contexts/CloudflareAuthContext.tsx`). Consider moving to httpOnly cookies.

## API and data
- `TemplatesContext` has a stubbed `userTemplates` query that always returns an empty array. A user-specific endpoint could replace it.

## Logging and analytics
- `src/lib/analytics.ts` stores events in memory and only logs to the console. There is no persistence or backend sink.

## Code cleanup
- `src/lib/api/client.ts` is unused by the app.
- Keep `db/schema.sql` aligned with `db/migrations/` to avoid drift.
