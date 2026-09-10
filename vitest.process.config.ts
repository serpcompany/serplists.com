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
    // Two workers keep Vitest's RPC event loop responsive under sustained load.
    maxWorkers: 2,
    maxConcurrency: 2,
  },
}));
