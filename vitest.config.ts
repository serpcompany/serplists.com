import { defineConfig } from 'vitest/config';
import path from 'path';

// Date rendering depends on the local timezone. Pin it so tests pass the same way on every
// machine and in CI. Workers inherit this environment.
process.env.TZ = 'UTC';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
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
