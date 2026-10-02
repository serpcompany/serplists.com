import { existsSync } from 'node:fs';
import path from 'node:path';
import { cruise } from 'dependency-cruiser';
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config';
import { beforeAll, describe, expect, it } from 'vitest';

import { SITEMAP_IMPLEMENTATION_SOURCES } from '../../../scripts/lib/sitemapLastmod';

const repoRoot = process.cwd();

const SITEMAP_ROUTE_HANDLERS_AND_FUNCTIONS = ['src/app/sitemap.xml', 'src/app/sitemaps', 'functions/sitemap'];

const READ_ROWS_BUT_LIST_NO_URLS = ['db/', 'functions/api/'];

const leftOutOnPurpose = new Map([
  ['functions/sitemap/bundled-catalog.generated.json', 'the catalog itself'],
  ['src/data/publicCategories.ts', 'covered by categoriesHash'],
  ['src/app/sitemaps/static.xml/route.ts', 'a redirect'],
]);

async function modulesTheSitemapCodeReaches(): Promise<string[]> {
  const { output } = await cruise(
    SITEMAP_ROUTE_HANDLERS_AND_FUNCTIONS,
    {
      tsPreCompilationDeps: true,
      doNotFollow: { path: ['node_modules', ...READ_ROWS_BUT_LIST_NO_URLS.map((prefix) => `^${prefix}`)] },
      tsConfig: { fileName: 'tsconfig.json' },
    },
    { extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'] },
    { tsConfig: extractTSConfig('tsconfig.json') },
  );
  if (typeof output === 'string') throw new Error(`dependency-cruiser answered with text: ${output.slice(0, 200)}`);
  return output.modules
    .map((module) => module.source)
    .filter((source) => /^(src|functions)\//.test(source))
    .filter((source) => !READ_ROWS_BUT_LIST_NO_URLS.some((prefix) => source.startsWith(prefix)));
}

let reached: string[] = [];

beforeAll(async () => {
  reached = await modulesTheSitemapCodeReaches();
}, 60_000);

describe('SITEMAP_IMPLEMENTATION_SOURCES', () => {
  it('names every module the sitemap functions reach, since only those files move the catalog\'s implementation date', () => {
    const listed = new Set<string>(SITEMAP_IMPLEMENTATION_SOURCES);
    const missing = reached.filter((file) => !listed.has(file) && !leftOutOnPurpose.has(file)).sort();

    expect(reached).toEqual(expect.arrayContaining(['functions/sitemap/routes.ts', 'src/app/sitemap.xml/route.ts']));
    expect(missing).toEqual([]);
  });

  it('names only files that exist and are not left out on purpose', () => {
    for (const file of SITEMAP_IMPLEMENTATION_SOURCES) {
      expect(existsSync(path.join(repoRoot, file)), file).toBe(true);
      expect(leftOutOnPurpose.has(file), file).toBe(false);
    }
  });
});
