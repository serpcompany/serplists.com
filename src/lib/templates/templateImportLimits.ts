// Client-side limits for importing a template file, checked before anything is sent. The file
// size and type checks are in src/features/template-backup/importFileSelection.ts, and asset
// sizes are checked per template by the API (src/lib/schemas/templateAssetLimits.ts).

export const MAX_TEMPLATES_PER_IMPORT = 5;
