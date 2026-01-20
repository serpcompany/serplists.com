# Data Service Pattern

The app uses a small API client wrapper plus React Query to manage server data.

## Related files
- `src/lib/api.ts` - API client used by the app
- `src/contexts/TemplatesContext.tsx` - Templates and runs queries
- `src/contexts/CloudflareAuthContext.tsx` - Auth bootstrapping
- `functions/api/handlers/*` - Server endpoints

## Pattern summary
1. **API client** (`src/lib/api.ts`) handles base URL, JSON, and auth token headers.
2. **Contexts** (Auth, Templates) own application state and call the API client.
3. **React Query** manages caching and invalidation for templates and runs.

## Example flow
- `TemplatesContext` calls `api.getTemplates()` and normalizes the sections structure.
- Mutations call `api.createTemplate` or `api.updateTemplate`, then invalidate `templates` and `runs` queries.

## Legacy code
- `src/lib/api/client.ts` is an older client and is not referenced.
- `src/api/` contains a Hono-based worker not wired into the build.
