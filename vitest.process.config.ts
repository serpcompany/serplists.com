import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';
import { d1BrowserRecoveryFiles, processDriverFiles } from './scripts/test/suites';

export default mergeConfig(base, defineConfig({
  test: {
    include: [...processDriverFiles],
    exclude: [...d1BrowserRecoveryFiles, '**/node_modules/**', '**/tmp/**'],
    fileParallelism: true,
    minWorkers: 1,
    // These tests intentionally use synchronous child-process boundaries.
    // Three workers retain bounded parallelism without the four-worker RPC stall.
    maxWorkers: 3,
    maxConcurrency: 3,
  },
}));
