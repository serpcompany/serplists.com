# Repo-backed template catalog (2026-03-22)

Issue `#31` needed a concrete first step toward "JSON first" templates. The app now supports a repo-backed public catalog without requiring those templates to exist in D1 first.

## What was added

- Public template packs live in `src/data/public-template-packs/*.json`
- Packs use the canonical portable template format (`kind: "serplists-template-pack"`, schema `2.0.0`)
- `src/lib/repoTemplateCatalog.ts` normalizes repo JSON through the same import logic used for uploaded template files
- `TemplatesContext` merges repo-backed public templates with D1 public templates
- `PublicTemplate` resolves repo-backed templates before falling back to the API

## Important behavior

- Repo-backed templates are treated as public templates in the library and public detail page
- If a repo template and D1 template share the same public slug, the repo template wins in the public catalog
- Saving a repo-backed public template creates a new private template in the user's account instead of trying to clone a D1 row that does not exist
- Starting a run from a repo-backed template still works because runs are created from the normalized section data, not from a required D1 template lookup

## Why this matters

- New public templates can now be added by committing JSON files instead of seeding D1 first
- Theme migrations get a cleaner content source because portable JSON is now directly consumable by the app
- The repo catalog path reuses the existing schema/validation pipeline, so we did not create a second template format just for runtime content
