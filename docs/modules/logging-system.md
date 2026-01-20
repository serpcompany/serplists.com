# Logging System Module

This project uses lightweight, client-side logging and analytics. There is no centralized logging service.

## Related files
- `src/components/ErrorBoundary.tsx` - React error boundary with console logging
- `src/lib/analytics.ts` - In-memory analytics tracker
- `src/pages/PublicTemplate.tsx` - Example analytics usage

## Current behavior
- **Console logging** is used for errors and debugging throughout the app.
- **ErrorBoundary** catches React render errors and logs to `console.error`.
- **Analytics** tracks page views and template view events in memory and logs to `console.info`.

## Limitations
- Analytics events are not persisted or sent to a backend.
- There is no server-side logging for Pages Functions.
- No structured log levels beyond standard console calls.

## Where to extend
- Add a real analytics/telemetry sink inside `src/lib/analytics.ts`.
- Add server-side logging in `functions/api/[[route]].ts` or handlers.
