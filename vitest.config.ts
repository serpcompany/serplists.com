import { defineConfig } from 'vitest/config';
import path from 'path';

// Range regression assertions are scheduled by the data gate, once per range.
export const dataRegressionFiles = [
  "scripts/data/sanitizer-export-cli.test.mjs",
  "scripts/data/sanitizer-export-pinned-wrangler.test.mjs",
  "scripts/data/data-write-failures.test.mjs",
  "scripts/data/route-behavior-regressions.test.mjs",
  "tests/unit/scripts/data/schema-contract.test.ts",
  "scripts/data/production-shaped-migration-matrix.test.ts",
  "tests/unit/functions/api/template-evolution-migration.test.ts",
  "tests/unit/functions/api/templates-handler.test.ts",
  "tests/unit/functions/api/checklists-handler.test.ts",
  "scripts/data/authenticated-visibility.test.mjs",
  "scripts/data/sanitized-state.test.mjs",
  "scripts/data/sanitizer-local-d1.test.mjs",
  "scripts/data/local-rehearsal-lifecycle.test.mjs",
  "scripts/data/teardown-probe.test.ts",
  "scripts/data/smoke-environment.test.mjs",
  "scripts/data/smoke-teardown.test.mjs",
  "scripts/data/workspace-cleanliness.test.mjs",
  "scripts/data/git-subprocess-env.test.mjs"
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Data integration files launch synchronous Git/Wrangler/compiler children.
    // Bound file-level parallelism on large-core developer hosts; concurrency
    // exercised inside each test remains unchanged.
    minWorkers: 1,
    maxWorkers: 2,
    setupFiles: './tests/setup.ts',
    exclude: [
      ...dataRegressionFiles,
      '**/node_modules/**',
      '**/dist/**',
      '**/tmp/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'tests/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}', 'functions/**/*.{ts,tsx}'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/tmp/**',
        '**/tests/**',
        '**/*.d.ts',
        'tests/e2e/**',
      ],
      all: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@functions': path.resolve(__dirname, './functions'),
    },
  },
});
