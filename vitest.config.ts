import { defineConfig } from 'vitest/config';
import path from 'path';

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
