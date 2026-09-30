## Summary

<!-- What changed and why. Link the issue: "Closes #123". -->

## Evidence

<!-- How you know it works. For UI changes, paste `pnpm run ui:snap` output or a
screenshot before and after. For bugs, show the reproduction failing first. -->

## Checklist

- [ ] `pnpm run verify` passes locally
- [ ] Tests added or updated for the behavior change
- [ ] Every review comment (Claude's and humans') is fixed or answered
- [ ] Docs updated where behavior changed (`docs/`, `ARCHITECTURE.md`)
- [ ] Exec plan progress and decision log updated (multi-step work only)
- [ ] Shortcuts recorded in `docs/exec-plans/tech-debt-tracker.md`
- [ ] No new entries in `eslint-suppressions.json` or the file-size caps
- [ ] Database changes: `pnpm run check:db:drizzle-parity` passes and `docs/generated/db-schema.md` is regenerated (see `docs/design-docs/database-operations.md`)
