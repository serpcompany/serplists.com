import { defineConfig } from 'vitest/config';

import everyTestFile from './vitest.config';

const { coverage, ...test } = everyTestFile.test ?? {};

export default defineConfig({
  ...everyTestFile,
  test: {
    ...test,
    projects: ['./vitest.local-d1.config.ts'],
    globalSetup: [],
    testTimeout: 20_000,
    coverage: { ...coverage, reportsDirectory: 'coverage/local-d1' },
  },
});
