# Template save async contract (2026-04-03)

## What changed

- Made the template update path awaitable end to end instead of fire-and-forget.
- Changed `useTemplates().updateTemplate` to use the async React Query mutation path.
- Moved the core save decision tree into a testable helper in [useTemplateSave.ts](/Users/devin/dev/repos/serplists.com/src/hooks/useTemplateSave.ts).
- Kept create navigation gated on confirmed persistence instead of optimistic navigation.
- Preserved existing `rules` data during update saves when the cached template already has rules.
- Added focused unit coverage in [useTemplateSave.test.ts](/Users/devin/dev/repos/serplists.com/tests/unit/hooks/useTemplateSave.test.ts).
- Excluded `tmp/**` from Vitest discovery so scratch repo mirrors do not contaminate local test runs.

## Why this was necessary

The previous save flow had two correctness problems:

- Edit saves called `updateTemplate` through a non-awaitable mutation, so the UI could report success before the network mutation finished.
- If an edit page was loaded outside the template query cache, the save hook could miss cached template context and silently skip important carried-over fields.

The new contract treats save as complete only after the mutation promise resolves or rejects.

## Verification completed

- `pnpm exec vitest run tests/unit/hooks/useTemplateSave.test.ts`
- `pnpm run typecheck`
- `pnpm exec eslint src/hooks/useTemplateSave.ts src/contexts/TemplatesContext.tsx src/types/checklist.ts vitest.config.ts tests/unit/hooks/useTemplateSave.test.ts`
- `curl http://localhost:8788/api/templates` returned `200` once the local API was running

## Verification still blocked locally

Full browser verification is still environment-blocked on this machine:

- the repo-local API trusts `FRONTEND_URL=http://localhost:8080`
- another local service is already occupying `localhost:8080`
- moving the frontend to `:4173` makes auth/template preflight requests fail with `403` because the API trusted origin no longer matches

Observed failures during Playwright verification:

- `OPTIONS /api/auth/sign-in/email` -> `403`
- `OPTIONS /api/templates` -> `403`

## Follow-up

- For local Playwright/browser verification, either free `localhost:8080` so the frontend can run on the trusted origin, or make the local trusted frontend origin configurable for alternate ports without hand-editing local env.
