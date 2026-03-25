# Public Template Docs Layout

Date: 2026-03-24

## Summary

The public template detail page reads better when it follows a docs/app pattern instead of a marketing-hero pattern.

## What worked

- Keep the top section compact: breadcrumb, title, one-sentence description, and inline metadata.
- Put primary actions in the header on desktop instead of dedicating a full action card.
- Use one primary preview surface for the checklist content.
- Use a right rail for "On this page" and lightweight template details.
- Keep checklist sections separated by dividers instead of wrapping each section in its own heavy card.
- Move repeat public UI patterns into shared primitives. `PublicPageLayout` now owns the back link, split rail layout, and sidebar section styling. `PublicPill` now owns the public-facing chip styles for categories and filter pills.

## What to avoid

- Large hero typography on utility pages.
- Multiple stacked cards for actions, stats, and walkthrough copy.
- Repeating metadata in separate boxes when it can live in one inline row.
