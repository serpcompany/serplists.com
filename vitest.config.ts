import { defineConfig } from 'vitest/config';
import path from 'path';

process.env.TZ = 'UTC';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: './tests/setup.ts',
    server: {
      deps: {
        inline: ['@opennextjs/aws'],
      },
    },
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
      'next/font/google': path.resolve(__dirname, './tests/support/nextFontGoogle.ts'),
      '@': path.resolve(__dirname, './src'),
      '@functions': path.resolve(__dirname, './functions'),
    },
  },
});
