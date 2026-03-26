# Template editor RHF foundation (2026-03-24)

## What changed

- Added a centralized top-level template editor form contract in [templateEditorDetailsForm.ts](/Users/devin/dev/repos/serplists.com/src/lib/forms/templateEditorDetailsForm.ts)
- Added the combined editor contract and nested field factories in [templateEditorForm.ts](/Users/devin/dev/repos/serplists.com/src/lib/forms/templateEditorForm.ts)
- Moved template metadata + SEO screens onto `react-hook-form`
- Moved section, task, content block, and sub-item editing to RHF-backed field arrays
- Updated the template editor e2e spec to the current `/dashboard/templates/...` route family

## Current RHF scope

The RHF-backed top-level fields are:

- `title`
- `description`
- `templateType`
- `categories`
- `tags`
- `isPublic`
- `seoTitle`
- `seoDescription`
- `seoUrl`

The RHF-backed nested builder now uses `useFieldArray` for:

- `sections`
- `items`
- `contents`
- `subItems`

The template editor is now one form model instead of a split top-level form plus separate nested state tree.

## Why this split

- It removes a large amount of prop drilling from the editor
- It creates one typed source of truth for the template form
- It gives the nested builder proper array operations instead of manual object/array mutation
- It makes later work on rules and run-input variables fit the same form system

## Verification

Completed:

- `pnpm exec vitest run tests/unit/lib/forms/templateEditorForm.test.ts tests/unit/lib/forms/templateEditorDetailsForm.test.ts tests/unit/components/TemplateHeader.test.tsx`
- `pnpm run typecheck`
- `pnpm exec eslint src/lib/forms/templateEditorForm.ts src/pages/TemplateEditor.tsx src/components/template-editor/SectionSidebar.tsx src/components/template-editor/SectionEditor.tsx src/components/template-editor/ItemEditor.tsx src/components/template-editor/ContentEditor.tsx src/components/template-editor/content-types/SubItemsEditor.tsx tests/unit/lib/forms/templateEditorForm.test.ts`
- Manual browser verification of `/dashboard/templates/new` via `agent-browser`
- Live browser smoke test of nested builder interactions:
  - logged in as Admin
  - opened `/dashboard/templates/new`
  - added a task
  - added sub-task content
  - confirmed sub-task input rendered
  - added a second section

Blocked:

- `pnpm exec playwright test tests/e2e/template-editor-bugs.spec.ts`
- Manual save/create verification

Both are currently blocked by local D1 schema drift in the dev API. The local backend is querying and inserting `templates.rules`, but the local database state does not currently have that column, so template list/create requests return `500`.

## Follow-up

- Add first-class rule editing UI
- Restore green e2e save/create verification once the local D1 schema state includes `templates.rules`
- Add the real run-input form model on the same RHF field system
