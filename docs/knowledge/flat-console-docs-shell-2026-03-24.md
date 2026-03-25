# Flat Console Docs Shell (2026-03-24)

## What changed

- Moved the console shell away from promo cards and stacked discovery boxes.
- Shifted checklist-heavy screens toward one primary docs panel with lighter outline rows.
- Flattened template editor, runs, and template list surfaces so they read more like docs/product tooling and less like nested marketing cards.

## Why this mattered

- The biggest inconsistency was not color alone. It was repeated "card inside card inside page card" structure across console routes.
- OpenPanel-style inspiration worked best when applied as layout discipline:
  - a narrow utility sidebar
  - a quiet top bar
  - one main bordered content surface
  - row-level emphasis instead of whole-card emphasis

## Implementation notes

- Prefer a single `docs-panel` wrapper for the main working area.
- Use border and subtle background shifts for hierarchy before adding shadows.
- Keep section/task outlines as rows with a left accent or muted background, not independent cards.
- Use copy and spacing that make the editor feel like a docs workspace instead of a setup wizard.

## Tailwind gotcha

- Do not use custom color opacity utilities like `bg-card/92` inside `@apply`.
- Tailwind v3 rejected those in `src/index.css` and the app stayed on the boot splash.
- For shared component classes, use normal CSS after `@apply`, for example:

```css
.docs-panel {
  @apply rounded-xl border border-border/80 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.12)];
  background-color: hsl(var(--card) / 0.96);
}
```

## Remaining follow-up

- Auth pages and dev-only helper bars still use older, louder boxed styling.
- `TemplateBackup` still contains several heavier boxed controls and should be flattened in a follow-up pass.
