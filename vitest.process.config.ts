import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';
import { d1BrowserRecoveryFiles, processDriverFiles } from './scripts/test/suites';

export default mergeConfig(base, defineConfig({
  test: {
    include: [...processDriverFiles],
    exclude: [...d1BrowserRecoveryFiles, '**/node_modules/**', '**/tmp/**'],
    fileParallelism: true,
    minWorkers: 1,
    maxWorkers: 4,
    maxConcurrency: 4,
  },
}));
