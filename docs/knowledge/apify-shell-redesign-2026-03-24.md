# Apify-inspired shell redesign (2026-03-24)

Issue `#41` is the first pass that pushed Serplists closer to the `apify.com` reference direction for both discovery pages and console pages.

## Decisions locked

- Public routes now use a lighter discovery shell:
  - softer background treatment
  - rounded top navigation
  - more editorial hero sections
  - stronger template-card marketplace styling
- Console routes now use the same shadcn light token set by default:
  - persistent left-side navigation on desktop
  - mobile drawer navigation
  - no forced `.dark` wrapper on the shell
- Public template detail pages now use a sticky desktop action rail and a mobile bottom action bar.
- Core discovery routes that received the heaviest treatment in this pass:
  - `/`
  - `/templates`
  - `/profile/{username}/{templateSlug}`
- Core console routes updated in this pass:
  - `/console`
  - `/console/templates`
  - `/console/runs`

## Implementation notes

- Route helpers in `src/lib/routes.ts` now classify:
  - app shell (`public` vs `console`)
  - public route tier (`marketing`, `core`, `secondary`, `minimal`)
  - console section (`home`, `templates`, `runs`, `account`)
- `src/components/Layout.tsx` uses those helpers instead of inferring UI state from auth alone.
- The first pass overreached on custom theme values. The corrected approach is:
  - keep shadcn default `slate` tokens in `src/index.css`
  - let the public shell render in light mode from those defaults
  - do not force the console shell into `.dark`; keep both shells on the default light palette unless a real theme switch is added
  - replace hard-coded accent badges and white cards on key pages with token-based classes (`bg-card`, `bg-secondary`, `text-muted-foreground`, `bg-primary`)

## Profile-page correction

- The `https://apify.com/compass` reference maps to the public creator profile route, not the public template detail route.
- `src/pages/UserProfile.tsx` should stay closer to an Apify publisher page:
  - narrow left profile sidebar
  - primary content column with a single `Public templates` catalog
  - flatter white surfaces with light borders instead of hero/glass marketing sections
- Prefer shadcn primitives on this route:
  - `Card` for each public-template result
  - `Separator` for the left-rail sections
  - avoid wrapping the whole sidebar in another oversized card shell
- Keep the profile content band constrained and centered:
  - wider left rail (`~248px`) so creator copy does not collapse awkwardly
  - right column capped to a narrower band instead of stretching across the full shell
  - two-column template grid on desktop so a profile with only two templates does not leave a giant empty slab on the far right

## Public-template correction

- `src/pages/PublicTemplate.tsx` should not reuse the old landing-page hero treatment.
- The correct feel is closer to an Apify actor detail page:
  - flatter product header, not a glass hero card
  - inline metadata rows instead of stacked metric cards
  - narrower sticky action rail (`320px` class of width, not `340px+`)
  - low-radius shadcn surfaces (`rounded-lg` / `rounded-md`), not pill chips or oversized `rounded-2xl` wrappers
- The saved bundle in `tmp/refs/1` is an Apify docs export, not an actor/product page:
  - good for left-rail spacing and low-radius chrome cues
  - not the primary visual reference for `/profile/{username}/{templateSlug}`

## Verification used

- `pnpm run typecheck`
- `pnpm exec eslint src/lib/routes.ts src/components/Layout.tsx src/pages/Index.tsx src/components/checklist-library/SearchAndFilters.tsx src/components/checklist-library/TemplateCard.tsx src/pages/ChecklistLibrary.tsx src/pages/PublicTemplate.tsx src/components/template/PublicTemplateContent.tsx src/components/templates/UserTemplatesSection.tsx src/pages/Templates.tsx src/pages/Dashboard.tsx tests/unit/lib/routes.test.ts`
- `pnpm exec vitest run tests/unit/lib/routes.test.ts tests/unit/components/Layout.test.ts tests/unit/pages/ChecklistLibrary.test.tsx tests/unit/pages/PublicTemplate.test.tsx --reporter=dot`
- `pnpm exec playwright test tests/e2e/public-template-catalog.spec.ts tests/e2e/route-structure.spec.ts --workers=1 --reporter=line`
- Browser screenshots captured on desktop:
  - `tmp/final-home-desktop.png`
  - `tmp/final-templates-desktop.png`
  - `tmp/final-template-desktop.png`
  - `tmp/final-console-home-desktop.png`
  - `tmp/final-console-templates-desktop.png`
  - `tmp/final-console-runs-desktop.png`
- Browser screenshots captured on mobile:
  - `tmp/final-home-mobile.png`
  - `tmp/final-template-mobile.png`
