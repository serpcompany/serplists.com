import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';
import { d1BrowserRecoveryFiles, processDriverFiles } from './scripts/test/suites';

const processWorkers = process.env.CI ? 2 : 4;
const processPool = process.env.CI ? 'forks' : 'threads';

export default mergeConfig(base, defineConfig({
  test: {
    include: [...processDriverFiles],
    exclude: [...d1BrowserRecoveryFiles, '**/node_modules/**', '**/tmp/**'],
    fileParallelism: true,
    minWorkers: 1,
    // These tests intentionally use synchronous child-process boundaries.
    // Isolated worker threads keep four-way execution fast without fork RPC stalls.
    pool: processPool,
    maxWorkers: processWorkers,
    maxConcurrency: processWorkers,
  },
}));
