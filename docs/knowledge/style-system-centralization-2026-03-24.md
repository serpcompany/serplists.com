# Style System Centralization (2026-03-24)

## What changed

- Added shared layout and surface primitives in:
  - `src/components/layout/page-shell.styles.ts`
  - `src/components/layout/page-shell.tsx`
- Centralized layout width tokens and panel shadow tokens in `src/index.css`.
- Migrated the most divergent shells onto the shared system:
  - public marketing pages: `About`, `Features`, `Pricing`, `Contact`, `Categories`
  - auth shell: `AuthPageShell`
  - error shell: `NotFound`
  - shared app shell widths: `Layout`, `PublicPageLayout`
  - key utility/editor wrappers: `DevLoginBar`, `TemplateHeader`, `TemplateEditor`, `ChecklistRun`, `PublicTemplate`, `Index`
- Removed the dead starter stylesheet `src/App.css`.

## Why this structure

- `page-shell.styles.ts` owns the reusable class-variance-authority tokens and plain style constants.
- `page-shell.tsx` only exports React components that compose those tokens.
- Splitting those files avoids the React Fast Refresh lint warning about exporting non-components from component modules.

## Shared primitives

- `PageContainer`
  - standardizes width and gutter behavior across public, console, narrow, and docs-style pages
- `PageSection`
  - standardizes vertical rhythm without repeating `mx-auto max-w-* px-* py-*`
- `PageHero`
  - standardizes eyebrow, heading, description, and CTA alignment
- `Surface`
  - standardizes glass/docs/metric/console panel treatments
- `IconBadge`
  - standardizes icon pill sizing and token usage

## Verification notes

- Targeted lint passed for all touched files.
- `pnpm exec tsc --noEmit` passed.
- Targeted Vitest checks passed:
  - `src/components/layout/page-shell.test.ts`
  - `tests/unit/components/PublicPageLayout.test.tsx`
  - `tests/unit/components/LayoutShell.test.tsx`
- `pnpm run build` passed.
- Browser verification on `http://localhost:8080` confirmed the shared shell rendered on:
  - `/`
  - `/features`
  - `/pricing`
  - `/about`
  - `/categories`
  - `/login`
  - `/this-route-does-not-exist`

## Local stack caveat

- During browser verification, the updated layouts rendered correctly, but the local API still returned `500` for `GET /api/templates`.
- Wrangler logs showed the failure comes from the templates query in the local API, not from the style refactor.
- If browser verification looks noisy in dev tools, separate the shared-shell work from that existing templates API issue.
