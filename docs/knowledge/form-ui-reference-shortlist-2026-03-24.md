# Form UI Reference Shortlist (2026-03-24)

Shortlist of visual references for the JSON-first template and run form redesign.

## Local screenshots

- `shadcn / React Hook Form docs`: [shadcn-react-hook-form-docs.png](/Users/devin/dev/repos/serplists.com/tmp/forms-reference/shadcn-react-hook-form-docs.png)
- `shadcn / TanStack Form docs`: [shadcn-tanstack-form-docs.png](/Users/devin/dev/repos/serplists.com/tmp/forms-reference/shadcn-tanstack-form-docs.png)
- `shadcn / Signup block`: [shadcn-signup-block.png](/Users/devin/dev/repos/serplists.com/tmp/forms-reference/shadcn-signup-block.png)
- `AutoForm homepage`: [autoform-homepage.png](/Users/devin/dev/repos/serplists.com/tmp/forms-reference/autoform-homepage.png)
- `Apify run/input reference`: [actor-single.png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/actor-single.png)
- `Apify dense app form reference`: [actors (another example with more components).png](/Users/devin/dev/repos/serplists.com/tmp/apify-reference/actors%20(another%20example%20with%20more%20components).png)

## Best use by screen

- `Template metadata`: use the compact `shadcn-signup-block` pattern. It is clean, familiar, and easy to adapt for title, slug, owner, visibility, tags, and category.
- `Template structure editor`: use the `shadcn` field styling, but not the simple stacked marketing layout. The structure editor should be a denser builder surface with repeated row groups for sections, steps, AI instructions, and completion rules.
- `Run configuration`: use the `actor-single` / `actors` Apify direction. That is the closest reference for a trustworthy, dense "configure and run" form.
- `Low-stakes settings forms`: `AutoForm` is visually acceptable for admin/settings screens, but not strong enough as the primary template builder UX.

## Product direction

- `Templates` should feel like a structured editor, not a generic long form. Think compact grouped cards, repeated step rows, inline add actions, and a persistent save bar.
- `Runs` should feel more operational. Use denser inputs, clearer defaults, and a stronger sidebar or top action area for "Run", "Save preset", and execution context.
- `Shared field system`: keep one shadcn field language across both screens so templates and runs feel like the same product.

## Source URLs

- `shadcn RHF docs`: https://ui.shadcn.com/docs/forms/react-hook-form
- `shadcn TanStack Form docs`: https://ui.shadcn.com/docs/forms/tanstack-form
- `shadcn signup block`: https://ui.shadcn.com/blocks/signup
- `AutoForm`: https://autoform.vantezzen.io/
