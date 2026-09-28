# Frontend

A React 18 single-page app in `src/`, built with Vite and TypeScript (`strict`).
Server state goes through TanStack Query, routing through React Router 6, and UI
through shadcn/ui on Tailwind ([DESIGN.md](DESIGN.md)). Path aliases: `@/*` maps to
`src/*`, `@functions/*` to `functions/*`.

## Structure

| Path | Role |
| --- | --- |
| `src/App.tsx`, `src/main.tsx` | Providers, routes, bootstrap |
| `src/pages/` | Route screens: compose components and feature models |
| `src/components/` | Feature UI; `components/ui/` holds presentational primitives |
| `src/features/*/` | Headless feature models (`use*Model.ts`) and mappers from API shapes to domain types |
| `src/contexts/` | Auth, Ownership Context (legacy `WorkspaceContext`), Templates and Runs |
| `src/hooks/` | Shared hooks |
| `src/lib/api.ts` | The only HTTP client (transport) |
| `src/lib/schemas/`, `src/types/` | Zod schemas and domain types, shared with the API |

Enforced by `pnpm run deps:check` ([ARCHITECTURE.md](../ARCHITECTURE.md)): pages and
components never call `src/lib/api.ts` at runtime (put the call in a feature model
or context), `components/ui/` stays presentational, and every module must be
reachable from `src/main.tsx`. Remaining legacy call sites are tracked in the
[UI decoupling plan](exec-plans/active/ui-decoupling.md).

Canonical private routes live under `/dashboard/*`; the full route list is in
[system overview](design-docs/system-overview.md#routes).

## Data and state

- `src/lib/api.ts` handles the base URL, JSON, and structured errors, and sends the
  Better Auth session cookie with `credentials: 'include'`. It never stores tokens.
  Responses are not yet parsed with Zod (TD-2 in the
  [tech debt tracker](exec-plans/tech-debt-tracker.md)).
- Contexts and feature models own server state with React Query. Query keys include
  the user id and the active Ownership Context so Personal and Organization data
  never mix; switching context invalidates Template and Run queries. Billing keys
  include the user id; never show a Free or Pro label while status is loading.
- Template and run lists load on demand. `TemplatesProvider` wraps every route but
  never fetches them. A page that reads `templates` (the public catalog) calls
  `useTemplateLists({ catalog: true, workspace: false })`, one that reads `allTemplates`
  calls `useTemplateLists()`, and one that reads `runs` adds `runs: true`. The run page
  fetches its own run by id. A catalog miss reads every public Template from D1
  ([D1 cost](design-docs/d1-cost.md)), so pages that only need official templates use
  the bundled `repoTemplates`. The catalog's query key has no user id because the
  catalog is the same for everyone.
- Mutations are complete only when the persistence promise resolves. Do not
  navigate or report success from a fire-and-forget mutation, and preserve fields
  you are not editing (for example, `rules`) on update.
- Surface API failures by their structured code, not message text: `401` means sign
  in (keep the return path), `403 upgrade_required` and `403 limit_reached` mean a
  plan gate, `503 billing_unavailable` means checkout is down.
- `authClient` (Better Auth) calls resolve with `{ data, error }` on HTTP failures
  instead of throwing. Check `result.error` before reporting success or doing any
  follow-up that assumes the change was saved, such as deleting the old avatar file.

## Template editor forms

- `src/lib/forms/templateEditorDetailsForm.ts` owns the top-level details contract;
  `src/lib/forms/templateEditorForm.ts` owns the combined editor contract, editor
  types with guaranteed ids, and nested field factories.
- Use React Hook Form field arrays for sections, items, content blocks, and
  sub-items instead of a second nested state tree.
- Omit an empty slug from create and update payloads rather than sending `""`, and
  omit an update's slug when it is the one already stored, so a stored slug that
  predates today's rules never blocks a save or moves the URL.
- Field limits and slug rules live in `src/lib/schemas/templateFields.ts`, shared
  with the API payload schema. The editor schema applies them with messages that
  name the field, and saves are validated before the API call. The URL slug is
  normalized (`slugifyTemplateSlug`) when the field loses focus and on save.
- Keep category autocomplete triggers as real text inputs and use `onKeyDown` for
  tag entry.
- Preserve `seoTitle`, `seoDescription`, `slug`/`seoUrl`, and `rules` across save
  and reload.
- A save sends a deep copy taken at click time (`getValues()` is shallow). When an
  update succeeds, `rebaseTemplateEditorFormAfterSave` makes the saved values the
  form's baseline and keeps any field edited while the save was in flight, so the
  form stays dirty and the unsaved-changes guards still warn. A create leaves the
  page when it finishes, so the editor is locked (a disabled `fieldset`) until then.
- Adding a content type or editor tab: [template content types](design-docs/template-content-types.md).

## Rendering user content

Render Markdown with `react-markdown` with raw HTML disabled, and pass links and
media URLs through `safeUrl` (`src/lib/utils/safeUrl.ts`).

## Verifying UI changes

Show the change working in the real app before opening a PR:
`pnpm run ui:snap -- <route> --login admin@test.com` for a screenshot and
accessibility tree, and the browser tests for flows
([development environment](design-docs/development-environment.md)).
