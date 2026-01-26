# Code Standards

These conventions reflect the current codebase and tooling.

## TypeScript
`tsconfig.json` is intentionally relaxed:
- `noImplicitAny: false`
- `noUnusedParameters: false`
- `noUnusedLocals: false`
- `strictNullChecks: false`
- `skipLibCheck: true`

Path aliases:
- `@/*` -> `src/*`
- `@functions/*` -> `functions/*`

## React
- Function components with typed props.
- Shared UI primitives live in `src/components/ui/`.
- Prefer `cn` from `src/lib/utils.ts` for class merging.

## State and data
- Use `src/lib/api.ts` for API calls.
- Prefer context + React Query for shared server state.

## Linting and checks
```bash
pnpm run lint
pnpm run typecheck
```
