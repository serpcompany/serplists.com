# SerpUI Key Screen Parity Audit (Phase 8)

Screens reviewed:
- `src/pages/Login.tsx`
- `src/pages/TemplateEditor.tsx`
- `src/pages/ChecklistRun.tsx`

## Findings
1. Login screen uses `AuthPageShell` and shadcn primitives, but still contains dev-focused quick-fill controls and mixed visual emphasis states that differ from SerpUI’s cleaner auth layout.
2. Template Editor layout is functionally strong but has dense spacing and mixed card/alert hierarchy compared to SerpUI’s normalized section rhythm and typography scale.
3. Checklist Run screen mixes several interaction patterns (collapsible, dialogs, inline editing) without a unified visual cadence, causing stronger style drift from SerpUI than the auth pages.

## Priority order for Phase 8 parity
1. `ChecklistRun` (largest drift, highest interaction surface)
2. `TemplateEditor` (high complexity, broad UI surface)
3. `Login` (smallest effort; mostly cleanup + token polish)

## Scope note
- This is a code-level parity audit only.
- Full visual parity requires a dedicated browser screenshot/interaction pass after token updates.
