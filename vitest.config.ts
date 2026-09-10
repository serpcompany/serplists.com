import { defineConfig } from 'vitest/config';
import path from 'path';
import { d1BrowserRecoveryFiles as dataRegressionFiles } from './scripts/test/suites';
export { d1BrowserRecoveryFiles as dataRegressionFiles } from './scripts/test/suites';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Preserve the verified serial gate for long synchronous Git/Wrangler
    // children. Concurrency exercised inside each test remains unchanged.
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
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
