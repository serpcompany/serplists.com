# Form-first shell reset (2026-03-24)

## Why this pass happened

The public and auth/editor routes had drifted toward oversized landing-page framing:

- too much hero spacing
- glass/shadow treatments everywhere
- editor chrome that read like a fake wizard
- auth copy that sold the product instead of getting users into the workflow

The product direction is stronger when it behaves like a fast SOP form system first and a marketing site second.

## What changed

- Flattened shared shell spacing and surface treatments in [page-shell.styles.ts](/Users/devin/dev/repos/serplists.com/src/components/layout/page-shell.styles.ts) and [index.css](/Users/devin/dev/repos/serplists.com/src/index.css)
- Tightened the reusable public split layout in [PublicPageLayout.tsx](/Users/devin/dev/repos/serplists.com/src/components/layout/PublicPageLayout.tsx)
- Rebuilt the auth shell around a compact form card plus a short “what happens after sign in” rail in [AuthPageShell.tsx](/Users/devin/dev/repos/serplists.com/src/components/auth/AuthPageShell.tsx)
- Rebuilt the template editor header and main panel framing around the form workflow in [TemplateHeader.tsx](/Users/devin/dev/repos/serplists.com/src/components/template-editor/TemplateHeader.tsx), [SectionSidebar.tsx](/Users/devin/dev/repos/serplists.com/src/components/template-editor/SectionSidebar.tsx), and [TemplateEditor.tsx](/Users/devin/dev/repos/serplists.com/src/pages/TemplateEditor.tsx)
- Reworked the template metadata and SEO panes into clearer form panels in [TemplateBasicInfo.tsx](/Users/devin/dev/repos/serplists.com/src/components/template-editor/TemplateBasicInfo.tsx) and [SEOMetaEditor.tsx](/Users/devin/dev/repos/serplists.com/src/components/template-editor/SEOMetaEditor.tsx)
- Replaced the homepage marketplace-heavy pitch with a template/run/publication workflow frame in [Index.tsx](/Users/devin/dev/repos/serplists.com/src/pages/Index.tsx)
- Moved template editor create/edit routes out of the global app shell in [App.tsx](/Users/devin/dev/repos/serplists.com/src/App.tsx), added route classification in [routes.ts](/Users/devin/dev/repos/serplists.com/src/lib/routes.ts), and hid the development login bar on those blank editor routes in [DevLoginBar.tsx](/Users/devin/dev/repos/serplists.com/src/components/DevLoginBar.tsx)

## Guardrails

- Keep route behavior, auth flow, and form contracts intact while stripping presentation
- Prefer shared shell changes over one-off page rewrites when possible
- Default to flatter surfaces and smaller spacing unless a screen has a strong reason not to
- Make public publishing feel secondary to template editing and run execution
- Keep the template editor on a blank workspace route while the form system is still being shaped, so surrounding GUI does not influence design decisions
- Use explicit form groupings instead of generic editor language:
  - `Identity`
  - `Organization`
  - `Access`
  - `Search preview`

## Verification

Completed:

- `pnpm exec vitest run tests/unit/components/TemplateHeader.test.tsx tests/unit/components/AuthPageShell.test.tsx tests/unit/components/PublicPageLayout.test.tsx src/components/layout/page-shell.test.ts tests/unit/pages/IndexLayout.test.tsx`
- `pnpm run typecheck`
- `pnpm exec eslint src/components/layout/page-shell.styles.ts src/components/layout/PublicPageLayout.tsx src/components/auth/AuthPageShell.tsx src/components/template-editor/TemplateHeader.tsx src/components/template-editor/SectionSidebar.tsx src/pages/TemplateEditor.tsx src/pages/Index.tsx tests/unit/components/TemplateHeader.test.tsx tests/unit/components/AuthPageShell.test.tsx tests/unit/components/PublicPageLayout.test.tsx src/components/layout/page-shell.test.ts tests/unit/pages/IndexLayout.test.tsx`
- Real browser verification with saved screenshots:
  - [home.png](/Users/devin/dev/repos/serplists.com/tmp/form-reset-verification/home.png)
  - [login.png](/Users/devin/dev/repos/serplists.com/tmp/form-reset-verification/login.png)
  - [template-editor.png](/Users/devin/dev/repos/serplists.com/tmp/form-reset-verification/template-editor.png)
  - [template-editor-blank.png](/Users/devin/dev/repos/serplists.com/tmp/form-reset-verification/template-editor-blank.png)
  - [template-form-focused.png](/Users/devin/dev/repos/serplists.com/tmp/form-reset-verification/template-form-focused.png)
  - [template-search-preview-focused.png](/Users/devin/dev/repos/serplists.com/tmp/form-reset-verification/template-search-preview-focused.png)

Observed during browser verification:

- `/` loads with the new workflow-first headline and trimmed sections
- `/login` loads with the compact auth shell and short operational rail
- `/dashboard/templates/new` loads with the stripped editor header and denser layout
- `/dashboard/templates/new` now renders as a blank workspace page with no console sidebar, public navigation, or dev login bar around the form
- the metadata panel now reads like a real template form instead of a generic settings sheet
- the SEO panel now reads like a search-preview form instead of a leftover “meta” bucket
- template inputs remain editable in the browser

Known blocker:

- The local API still returns `500` on template list/create requests because the local D1 state is missing `templates.rules`
- That backend schema drift is separate from this shell reset, but it still pollutes console output on authenticated template routes

## Next step

- Apply the same stripped layout direction to the remaining public marketing/detail pages instead of reintroducing custom hero/card compositions
