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
- Use `sonner` for toast feedback.
- Render Markdown with `react-markdown`, disable raw HTML, and transform links and
  media URLs with `safeUrl` from `src/lib/utils/safeUrl.ts`.

## State and data
- Use `src/lib/api.ts` for API calls.
- Prefer context + React Query for shared server state.
- Treat create/update mutations as complete only after the persistence promise
  resolves; do not navigate or report success from a fire-and-forget mutation.

## Template editor forms

- `src/lib/forms/templateEditorDetailsForm.ts` owns the typed top-level details
  contract.
- `src/lib/forms/templateEditorForm.ts` owns the combined editor contract and
  nested field factories.
- Use React Hook Form field arrays for sections, items, content blocks, and
  sub-items instead of maintaining a second nested state tree.
- Omit an empty slug from create/update payloads rather than sending `""`.
- Keep category autocomplete triggers as real text inputs and use `onKeyDown`
  for tag-enter handling.
- Preserve `seoTitle`, `seoDescription`, `slug`/`seoUrl`, and `rules` across
  save and reload paths.

## Linting and checks
```bash
pnpm run lint
pnpm run typecheck
```
