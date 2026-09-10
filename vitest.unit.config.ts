import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';
import { d1BrowserRecoveryFiles, fastDatabaseFiles, unitFiles } from './scripts/test/suites';

export default mergeConfig(base, defineConfig({
  test: {
    include: [...unitFiles],
    exclude: [
      ...d1BrowserRecoveryFiles,
      ...fastDatabaseFiles,
      'tests/unit/scripts/data/**',
      '**/node_modules/**',
      '**/tmp/**',
    ],
    fileParallelism: true,
    maxWorkers: 8,
  },
}));
