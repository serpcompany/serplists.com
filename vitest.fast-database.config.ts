import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';
import { fastDatabaseFiles } from './scripts/test/suites';

export default mergeConfig(base, defineConfig({
  test: {
    include: [...fastDatabaseFiles],
    exclude: ['**/node_modules/**', '**/tmp/**'],
    fileParallelism: true,
    maxWorkers: 4,
  },
}));
