import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { SITEMAP_IMPLEMENTATION_SOURCES } from '../../../scripts/lib/sitemapLastmod';

const repoRoot = process.cwd();

const readRowsButListNoUrls = ['db/', 'functions/api/'];

const leftOutOnPurpose = new Map([
  ['functions/sitemap/bundled-catalog.generated.json', 'the catalog itself'],
  ['src/data/publicCategories.ts', 'covered by categoriesHash'],
  ['src/app/sitemaps/static.xml/route.ts', 'a redirect'],
]);

const toRepoPath = (absolute: string) => path.relative(repoRoot, absolute).split(path.sep).join('/');

function listFiles(directory: string): string[] {
  return readdirSync(path.join(repoRoot, directory)).flatMap((name) => {
    const relative = `${directory}/${name}`;
    if (statSync(path.join(repoRoot, relative)).isDirectory()) return listFiles(relative);
    return /\.tsx?$/.test(name) ? [relative] : [];
  });
}

function repositoryImportBase(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('.')) return path.resolve(repoRoot, path.dirname(fromFile), specifier);
  if (specifier.startsWith('@/')) return path.resolve(repoRoot, 'src', specifier.slice(2));
  if (specifier.startsWith('@functions/')) return path.resolve(repoRoot, 'functions', specifier.slice(11));
  return null;
}

function resolveImport(fromFile: string, specifier: string): string | null {
  const base = repositoryImportBase(fromFile, specifier);
  if (base === null) return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  const found = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!found) throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
  return toRepoPath(found);
}

function reachableFiles(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    const { importedFiles } = ts.preProcessFile(readFileSync(path.join(repoRoot, file), 'utf8'), true, true);
    for (const { fileName } of importedFiles) {
      const resolved = resolveImport(file, fileName);
      if (resolved && !readRowsButListNoUrls.some((prefix) => resolved.startsWith(prefix))) queue.push(resolved);
    }
  }
  return seen;
}

describe('SITEMAP_IMPLEMENTATION_SOURCES', () => {
  const sitemapRouteHandlersAndFunctions = [
    ...listFiles('src/app/sitemap.xml'),
    ...listFiles('src/app/sitemaps'),
    ...listFiles('functions/sitemap'),
  ];

  it('names every module the sitemap functions reach, since only those files move the catalog\'s implementation date', () => {
    const listed = new Set<string>(SITEMAP_IMPLEMENTATION_SOURCES);
    const missing = [...reachableFiles(sitemapRouteHandlersAndFunctions)]
      .filter((file) => !listed.has(file) && !leftOutOnPurpose.has(file))
      .sort();
    expect(missing).toEqual([]);
  });

  it('names only files that exist and are not left out on purpose', () => {
    for (const file of SITEMAP_IMPLEMENTATION_SOURCES) {
      expect(existsSync(path.join(repoRoot, file)), file).toBe(true);
      expect(leftOutOnPurpose.has(file), file).toBe(false);
    }
  });
});
