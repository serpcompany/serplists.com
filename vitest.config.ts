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
    server: {
      deps: {
        // tests/support/nextRouting.ts runs OpenNext's routing, which is published unbundled
        // (extensionless imports) for OpenNext's own bundler: let Vite resolve it.
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
      // Compiled by the Next.js build; tests load a stand-in (tests/support/nextFontGoogle.ts).
      'next/font/google': path.resolve(__dirname, './tests/support/nextFontGoogle.ts'),
      '@': path.resolve(__dirname, './src'),
      '@functions': path.resolve(__dirname, './functions'),
    },
  },
});
