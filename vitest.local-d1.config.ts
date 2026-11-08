import { defineConfig } from 'vitest/config';

import everyTestFile from './vitest.config';

const { coverage, ...test } = everyTestFile.test ?? {};

if (coverage?.provider !== 'v8') throw new Error('vitest.config.ts must measure coverage with the v8 provider');

export default defineConfig({
  ...everyTestFile,
  test: {
    ...test,
    projects: ['./vitest.local-d1.config.ts'],
    globalSetup: [],
    testTimeout: 20_000,
    coverage: { ...coverage, all: false, reportsDirectory: 'coverage/local-d1' },
  },
});
