# Live public-route UI audit (2026-03-24)

## Scope

Production routes audited with `agent-browser` on `https://serplists.com`:

- `/`
- `/features`
- `/pricing`
- `/checklists`
- `/about`
- `/contact`
- `/login`
- `/register`
- `/profile/serp`
- `/checklists/technical-seo-audit-checklist`

Artifacts saved in `tmp/ui-audit-2026-03-24/`:

- desktop + mobile full-page screenshots for every audited route
- reusable collection helper: `tmp/ui-audit-2026-03-24/collect-route-audit.sh`

No client-side runtime errors were reported by `agent-browser errors` on the audited pages.

## Important mismatch

Production is not rendering the same route labels/copy as the current repo:

- live navigation uses `/checklists` and `/dashboard`
- current `src/` route model uses `/templates` and `/console`
- live homepage H1 is `Create and Run Checklists for Your Processes`
- current `src/pages/Index.tsx` uses different headline and layout copy

Use the file references below as implementation targets for the next deploy, not as a literal source map for the currently live DOM.

## Page measurements

| Route | Desktop evidence | Mobile evidence |
| --- | --- | --- |
| `/` | H1 width `1368px`; `7` checklist cards in a `3`-column grid; `14` repeated `View Checklist` CTAs | header height `118px`; H1 spans `120px` tall before any card content |
| `/features` | H1 width `1368px`; only `4` cards and ~`657` body-text chars on a `1200px` tall page | one-column stack with the same sparse content |
| `/pricing` | H1 width `1368px`; only `2` pricing cards and ~`630` body-text chars on a `1200px` tall page | one-column stack with large empty lower-half area |
| `/checklists` | H1 width `1248px`; `7` cards in a `3`-column grid; repeated author/category labels | one-column stack; filter/sort area consumes substantial space before results |
| `/about` | H1 width `1368px`; only `3` value cards and ~`531` body-text chars on a `1200px` tall page | same sparse structure, stretched vertically |
| `/contact` | H1 width `1368px`; only `2` cards and ~`424` body-text chars on a `1200px` tall page | two stacked contact cards with very little supporting trust content |
| `/login` | centered auth card with no header/nav and only `111` body-text chars | compact but still single-task and visually empty |
| `/register` | centered auth card with only `145` body-text chars | same thin shell pattern as login |
| `/profile/serp` | duplicated `Featured Templates` and `Recent Templates`; `16` repeated `View Template` CTAs | profile header consumes ~`495px` before first catalog section |
| `/checklists/technical-seo-audit-checklist` | content starts after a large metadata band; checklist content area begins well below fold | `Template Content` section begins around `486px` down the page |

## High-priority findings

### 1. Navigation is repeated too many times for the amount of content

Live evidence:

- all marketing pages repeat the same core labels in header and footer
- the home route also repeats template CTAs aggressively (`14` identical `View Checklist` buttons)

Implementation targets:

- `src/components/Layout.tsx`
- `src/components/layout/footerLinks.ts`

Recommendation:

- keep one primary discovery nav in the header
- reduce the footer to company/support/legal
- remove duplicate route labels from the “outside the app” column
- treat CTA repetition as a conversion decision, not a default rendering pattern

Related references:

- [apify-compass-reference.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/apify-compass-reference.png)
- [apify-public-10989.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/apify-public-10989.png)

### 2. The marketing pages are too sparse to feel trusted

Live evidence:

- `/features`, `/pricing`, `/about`, and `/contact` all occupy roughly a full desktop viewport while carrying only a small hero plus 2-4 cards
- the result is “placeholder page” energy instead of product confidence

Implementation targets:

- `src/pages/Features.tsx`
- `src/pages/Pricing.tsx`
- `src/pages/About.tsx`
- `src/pages/Contact.tsx`

Recommendation:

- replace the hero-plus-cards formula with denser, more evidence-based sections
- add screenshots, product proof, FAQ/comparison blocks, creator proof, and stronger social trust
- use GitHub/Appify-style information density: less theatrical spacing, more useful context above the fold

Related references:

- [apify-public-10989.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/apify-public-10989.png)
- [docs.apify.com_sdk_js_docs_overview.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/docs.apify.com_sdk_js_docs_overview.png)

### 3. Auth pages waste most of the desktop viewport

Live evidence:

- `/login` and `/register` center a narrow card in a full-height page with very little surrounding information
- the actual form task feels visually stranded

Implementation target:

- `src/components/auth/AuthPageShell.tsx`

Recommendation:

- remove `min-h-screen` centering as the default auth layout
- reduce the top brand block to a small logo row
- pull the form higher
- optionally add a side panel with proof, benefits, or recent activity instead of empty space

Related references:

- [actor-single.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/actor-single.png)
- [actors (another example with more components).png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/actors%20(another%20example%20with%20more%20components).png)

### 4. The checklist library stacks multiple summary layers before content

Live evidence:

- `/checklists` shows hero copy, hero metrics, search, view toggle, category filter, result count, selected pills, then the result grid
- too much chrome competes with the catalog itself

Implementation targets:

- `src/pages/ChecklistLibrary.tsx`
- `src/components/checklist-library/SearchAndFilters.tsx`

Recommendation:

- merge search, filter, and result count into one compact toolbar
- demote or remove the hero metric cards
- show categories once, not in both hero and active-filter areas unless they serve different jobs

Related references:

- [apify-compass-reference.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/apify-compass-reference.png)
- [apify-public-10989.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/apify-public-10989.png)

### 5. Public template detail still has too much pre-content framing

Live evidence:

- on mobile, the first content section on `/checklists/technical-seo-audit-checklist` does not begin until roughly `486px`
- metadata is shown in several places before the user reaches the actual checklist

Implementation target:

- `src/components/template/PublicTemplateView.tsx`

Recommendation:

- compress the top band into one line of metadata plus one CTA row
- remove the fake single-tab “Overview” strip
- move secondary details into a disclosure on mobile
- let the checklist content start substantially higher

Related references:

- [docs.apify.com_sdk_js_docs_overview.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/docs.apify.com_sdk_js_docs_overview.png)
- [actors (another example with more components).png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/actors%20(another%20example%20with%20more%20components).png)

## Maintainability notes

### Shared shell data is duplicated instead of modeled once

Targets:

- `src/components/Layout.tsx`
- `src/components/layout/footerLinks.ts`

Recommendation:

- define one route-information model with fields like `placement: header | footer | support`
- derive header/mobile/footer rendering from that source
- avoid keeping the same labels in `publicNavigation`, `publicFooterColumns`, and `footerLinks`

Related references:

- [apify-public-10989.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/apify-public-10989.png)

### The catalog card pattern is too heavy for a repeatable grid

Targets:

- `src/components/checklist-library/TemplateCard.tsx`
- `src/index.css`
- `src/components/layout/page-shell.styles.ts`

Recommendation:

- flatten card chrome
- reduce corner radius
- reduce shadow depth
- remove the secondary stat slab inside each card
- keep one metadata line and one clear CTA

Related references:

- [apify-compass-reference.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/apify-compass-reference.png)

### Shared spacing tokens are still marketing-first, not route-specific

Targets:

- `src/components/layout/page-shell.styles.ts`
- `src/index.css`

Recommendation:

- split spacing/surface tokens by route intent: `marketing`, `catalog`, `docs`, `auth`
- the current global defaults make thin pages feel oversized because every route inherits generous hero padding, glass panels, and roomy shadows

Related references:

- [docs.apify.com_sdk_js_docs_overview.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/docs.apify.com_sdk_js_docs_overview.png)
- [actor-single.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/actor-single.png)

## Suggested next pass

1. Collapse the public navigation/footer IA into one shared config and remove repeated labels.
2. Rebuild `/features`, `/pricing`, `/about`, and `/contact` as denser proof-driven pages.
3. Flatten the checklist library and template cards toward an Apify/GitHub density level.
4. Strip excess framing from auth and public-template detail routes, especially on mobile.
