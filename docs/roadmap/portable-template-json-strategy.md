# Portable template JSON strategy

This plan turns issue `#17` into a concrete post-MVP platform feature instead of a vague import/export cleanup task.

## Goal

Create a versioned, portable JSON format for Serplists templates that works for:

- user backup and restore
- AI-generated template creation
- SOP and required-step workflows
- Git-managed template libraries
- future marketplace or catalog imports

## Current state

The app already has a basic import/export path:

- server import/export routes in `functions/api/handlers/templates.ts`
- client parsing and normalization in `src/lib/utils/templateBackup.ts`
- current Zod schema in `src/lib/schemas/checklistSchema.ts`
- format docs in `docs/schema/README.md`

That is enough for backup-style JSON, but it is still too close to app storage to be the long-term portable contract.

## Recommended product direction

Treat this work as three separate layers:

1. Portable template contract
2. Import/export adapters
3. Optional sync integrations

The portable contract should be the source of truth. Backup/export and GitHub sync should be adapters around it.

## What this unlocks

- bulk AI generation of valid templates
- customer-owned SOP libraries
- template packs stored in Git repos
- PR review and version history for template changes
- future template marketplace ingestion
- safer portability across users, environments, and products

## Validation strategy

Use four validation layers in order.

### 1. Version + migration

- Every portable file must have a schema version.
- Older versions should migrate to the latest shape before save.
- Current lenient imports should remain supported through migration adapters.

### 2. Schema validation

- Use Zod as the runtime validator in app code.
- Also publish JSON Schema for external tools and AI workflows.
- Keep the portable schema smaller and cleaner than the current internal row-shaped export.

### 3. Semantic validation

These rules answer: "Is this a valid template?"

Examples:

- must have at least one section
- each section must have a title
- each item must have a title
- `subItems` content must contain at least one sub-item
- media content must contain valid URL or upload metadata

### 4. Business-policy validation

These rules answer: "Is this allowed in our product?"

Examples:

- Pro-only import/export
- max templates per import file
- asset size limits
- duplicate slug handling
- visibility rules on import
- archive/public/private policy

## Rules model for SOP and AI use

Do not use arbitrary JavaScript rules.

Use a fixed rule catalog with predictable validation output.

Recommended shape:

```json
{
  "rules": [
    { "id": "has-owner", "type": "required", "path": "metadata.owner", "severity": "error" },
    { "id": "proof-required", "type": "minItems", "path": "evidence", "value": 1, "severity": "error" },
    { "id": "allowed-links", "type": "urlHostIn", "path": "links[]", "value": ["github.com"], "severity": "warning" }
  ]
}
```

Validation results should always return:

- `ruleId`
- `severity`
- `path`
- `message`

That makes the same validation usable in UI, imports, API responses, and future AI-agent workflows.

## Schema design guidance

### Keep as canonical

- template title/description/type
- sections/items/contents
- optional metadata intended for portable use
- explicit version
- optional rules block

### Keep as import/export adapter logic, not core contract

- `userId`
- created/updated timestamps
- local IDs that only matter inside the app
- DB-specific visibility storage details

### Use schema.org only as an adapter

`schema.org` can help for export/import mappings such as `HowTo` or `Recipe`, but it should not become the app's core runtime schema.

## GitHub repo backup and sync recommendation

Yes, this can be valuable, but not as the first step.

### Why it is useful

- version control for templates
- PR-based review for SOP changes
- clean collaboration for teams
- easy AI access to repo-stored template packs
- better auditability than opaque app-only backups

### Recommended order

1. Finish the portable JSON contract
2. Support repo-ready export layout
3. Support import from repo files or raw URLs
4. Later add authenticated GitHub sync

### Recommended integration shape

Prefer a GitHub App or repo-scoped integration over personal-account backup first.

Reason:

- narrower permissions
- better org/team fit
- clearer install model
- safer than broad personal-token access

### Good first GitHub capability

Export templates as repo-ready JSON files, for example:

```text
/serplists-pack/manifest.json
/serplists-pack/templates/content-refresh.json
/serplists-pack/templates/keyword-mapping.json
```

That gives immediate value without introducing sync conflicts, OAuth scope complexity, or background sync jobs.

## Suggested delivery phases

### Phase 1: canonical portable schema

- [x] Define `portable-template` schema v2
- [x] Define migration rules from current import/export shapes
- [ ] Generate JSON Schema from the canonical Zod schema
- [x] Document the canonical format and examples
- [x] Add tests for valid, invalid, and migrated payloads

### Phase 2: hardened import/export adapters

- [x] Split export modes: `portable` and `backup`
- [x] Normalize all accepted input formats into the canonical internal shape
- [x] Preserve portable SEO metadata and `rules` through import/export/reload paths
- [ ] Improve partial-failure reporting per template
- [x] Add asset manifest and warnings
- [x] Add tests for import/export edge cases and backward compatibility

### Phase 3: rule catalog for SOP and AI workflows

- [ ] Define the first rule catalog and result format
- [ ] Validate rules during import and preview
- [ ] Expose rule failures in API and UI in a stable shape
- [ ] Document supported rule types and examples
- [ ] Add tests for rule evaluation and error reporting

### Phase 4: repo-ready GitHub workflow

- [x] Load public templates from repo JSON packs in the app runtime
- [ ] Add repo-ready export pack format
- [ ] Add import from repo file or raw URL
- [ ] Define manifest and pack layout
- [ ] Document team workflow for PR-reviewed template packs
- [ ] Decide whether full GitHub App sync is worth building

Current runtime baseline:
- Public repo-backed templates live in `src/data/public-template-packs/*.json`
- The app loads those portable JSON packs directly and merges them with D1 public templates
- If a repo template and D1 template share a public slug, the repo-backed template wins for the public catalog so JSON remains the primary source

## Acceptance criteria

- The project has one canonical portable template JSON contract
- Older JSON inputs are migrated through explicit adapters
- Validation errors are structured and stable
- Backup/export and portable/template-pack exports are clearly separated
- The plan for GitHub-backed template packs is documented without forcing OAuth sync into the first release
