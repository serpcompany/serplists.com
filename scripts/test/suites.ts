export const d1BrowserRecoveryFiles = [
  'scripts/data/sanitizer-export-cli.test.mjs',
  'scripts/data/sanitizer-export-pinned-wrangler.test.mjs',
  'scripts/data/data-write-failures.test.mjs',
  'scripts/data/route-behavior-regressions.test.mjs',
  'tests/unit/scripts/data/schema-contract.test.ts',
  'scripts/data/production-shaped-migration-matrix.test.ts',
  'tests/unit/functions/api/template-evolution-migration.test.ts',
  'tests/unit/functions/api/templates-handler.test.ts',
  'tests/unit/functions/api/checklists-handler.test.ts',
  'scripts/data/authenticated-visibility.test.mjs',
  'scripts/data/sanitized-state.test.mjs',
  'scripts/data/sanitizer-local-d1.test.mjs',
  'scripts/data/local-rehearsal-lifecycle.test.mjs',
  'scripts/data/teardown-probe.test.ts',
  'scripts/data/smoke-environment.test.mjs',
  'scripts/data/smoke-teardown.test.mjs',
  'scripts/data/workspace-cleanliness.test.mjs',
  'scripts/data/git-subprocess-env.test.mjs',
  'scripts/data/invariant-capture-wrangler.test.mjs',
  'scripts/data/post-schema-local-d1.test.ts',
  'scripts/data/source-schema-local-d1.test.ts',
] as const;

export const fastDatabaseFiles = [
  'tests/fast-database/**/*.test.{ts,tsx,mjs}',
  'tests/unit/functions/sitemap.test.ts',
] as const;

export const unitFiles = [
  'src/**/*.test.{ts,tsx}',
  'tests/unit/**/*.test.{ts,tsx,mjs}',
  'tests/integration/api.workerless.test.ts',
] as const;

export const processDriverFiles = [
  'scripts/**/*.test.{ts,tsx,mjs}',
  'tests/typecheck-gate.test.mjs',
] as const;
