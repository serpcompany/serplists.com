# SerpUI Style Divergence (Phase 8 baseline)

## Current state
- `components.json` uses:
  - `style: "default"`
  - `baseColor: "neutral"`
- Serp boilerplate target uses:
  - `style: "new-york"`
  - `baseColor: "neutral"`

## Decision
- Keep `style: "default"` for now.
- Move color tokens/base color to neutral now.
- Treat full `new-york` style parity as part of the planned Phase 8 UI migration pass.

## Why
- Current auth/billing hardening work is now stable and verified on production.
- A full component-style restyle can cause broad visual regressions across existing pages.
- Phase 8 already scopes a dedicated parity pass for Login, Template Editor, and Checklist Run.

## Follow-up checklist (Phase 8)
1. Snapshot current UI states for key screens.
2. Switch style/baseColor in a branch and run visual parity checks.
3. Update token mappings in `src/index.css` and any component overrides.
4. Run responsive + accessibility checks before merge.
