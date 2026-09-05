import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { buildSync } = wranglerRequire('esbuild');
const harness = buildSync({
  entryPoints: ['tests/e2e/fixtures/run-mutation-harness.tsx'], bundle: true, write: false,
  format: 'iife', globalName: 'RunMutationHarness', platform: 'browser',
  alias: { '@': path.resolve('src') },
  // Vite's build-time repository catalog is unrelated to this hook harness.
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.glob': '__emptyCatalog', 'import.meta.env': '{}' },
  banner: { js: 'const __emptyCatalog = () => ({});' },
}).outputFiles[0].text;

for (const mode of ['private', 'shared'] as const) {
  for (const navigation of ['change', 'return', 'stay'] as const) {
    test(`@smoke run mutation completion respects ${mode} route ${navigation}`, async ({ page }) => {
      await page.route('**/api/**', route => route.fulfill({ json: [] }));
      await page.goto('/');
      await page.addScriptTag({ content: harness });
      const result = await page.evaluate(async ({ mode, navigation }) => {
        return (window as unknown as { RunMutationHarness: typeof import('./fixtures/run-mutation-harness') }).RunMutationHarness.mutationNavigationScenario(mode, navigation);
      }, { mode, navigation });
      expect(result.id).toBe(result.expectedId);
      expect(result.selected).toBe(`${result.expectedId}-selected`);
      expect(result.notes).toBe(navigation === 'stay' ? 'late mutation' : '');
      expect(result.revision).toBe(navigation === 'stay' ? 2 : 1);
    });
  }
}
