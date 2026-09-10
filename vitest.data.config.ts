import { defineConfig } from 'vitest/config';
import config, { dataRegressionFiles } from './vitest.config';

export default defineConfig({
  ...config,
  test: { ...config.test, include: dataRegressionFiles, exclude: ['**/node_modules/**', '**/tmp/**'], fileParallelism: false },
});
