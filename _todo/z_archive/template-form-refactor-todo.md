# Template Form Refactor TODO

## Phase 1

- [x] Audit current template and run fields
- [x] Add field inventory and form-stack recommendation to issue `#42`
- [x] Add unit tests for the template editor form contract and defaults
- [x] Centralize template editor top-level form values and mapping helpers
- [x] Refactor template metadata and SEO screens to use `react-hook-form`
- [x] Preserve current save behavior for title, description, type, visibility, categories, tags, and SEO fields
- [x] Run targeted unit tests for the new form contract
- [x] Defer targeted save-flow e2e coverage until after the upcoming editor UI changes
Current decision: do not spend more time stabilizing create/edit browser save-flow tests against the current editor UI because that surface is about to change. Keep the focused unit coverage for the save contract and restore browser save-flow coverage after the redesign settles.
- [x] Run `pnpm run typecheck`
- [x] Add a knowledge note capturing the RHF form architecture decisions

## Phase 2

- [x] Move section, task, content block, and sub-item editing to `useFieldArray`
- [ ] Introduce first-class template rule editing UI
- [ ] Introduce a real run-input form model beyond `templateId + runName`

## Phase 3

- [x] Strip the shared page shell down to a flatter, denser form-first visual system
- [x] Rebuild the auth and template editor headers around the form workflow instead of marketing chrome
- [x] Cut the homepage down to template editing, run execution, and public publishing
- [x] Move template editor create/edit routes onto a blank workspace shell with no app chrome
- [x] Refocus template metadata and SEO panes into actual form panels with identity/access/organization and search-preview groupings
- [x] Add regression tests for the new compact shell copy and layout tokens
- [x] Verify `/`, `/login`, and `/dashboard/templates/new` in a real browser and save reference screenshots
- [ ] Continue replacing the remaining public marketing/detail pages with the same stripped docs/form direction
