import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';
import path from 'path';

import { testWorkerLimit } from './scripts/lib/local-test-workers';

process.env['TZ'] = 'UTC';

const TESTS_THAT_RENDER_INTO_THE_DOM = '**/*.dom.test.tsx';

const HAPPY_DOM_FOLLOWS_NO_LINK = {
  disableMainFrameNavigation: true,
  disableChildFrameNavigation: true,
  disableChildPageNavigation: true,
  disableFallbackToSetURL: true,
};

const NEVER_TEST_FILES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/tmp/**',
  '**/playwright-report/**',
  '**/test-results/**',
  'tests/e2e/**',
];

const workerLimit = testWorkerLimit(process.env, availableParallelism());

const EVERY_TEST_FILE = {
  globals: true,
  setupFiles: './tests/setup.ts',
  server: {
    deps: {
      inline: ['@opennextjs/aws'],
    },
  },
};

const resolve = {
  alias: {
    'next/font/google': path.resolve(__dirname, './tests/support/nextFontGoogle.ts'),
    '@': path.resolve(__dirname, './src'),
    '@functions': path.resolve(__dirname, './functions'),
  },
};

export default defineConfig({
  test: {
    ...EVERY_TEST_FILE,
    ...(workerLimit === null ? {} : { maxWorkers: workerLimit }),
    name: 'node',
    environment: 'node',
    exclude: [...NEVER_TEST_FILES, TESTS_THAT_RENDER_INTO_THE_DOM],
    projects: [
      './vitest.config.ts',
      {
        resolve,
        test: {
          ...EVERY_TEST_FILE,
          name: 'dom',
          environment: 'happy-dom',
          environmentOptions: { happyDOM: { settings: { navigation: HAPPY_DOM_FOLLOWS_NO_LINK } } },
          include: [TESTS_THAT_RENDER_INTO_THE_DOM],
          exclude: NEVER_TEST_FILES,
        },
      },
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
  resolve,
});
