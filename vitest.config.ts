import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: './tests/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'tests/e2e/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@functions': path.resolve(__dirname, './functions'),
    },
  },
});
