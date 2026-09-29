import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { SITEMAP_IMPLEMENTATION_SOURCES } from '../../../scripts/lib/sitemapLastmod';

// The sitemap cache key and lastmods only move when the bundled catalog changes, and a
// code change reaches the catalog only through the files in SITEMAP_IMPLEMENTATION_SOURCES.
// This walks the sitemap imports so moving sitemap code into a new module fails here
// until the list names it.

const repoRoot = process.cwd();

// Imports under these prefixes are never walked: the schema, the database client and
// the API types decide how rows are read, not which URLs a sitemap lists, and counting
// them would rebuild every sitemap after each schema change.
const notWalked = ['db/', 'functions/api/'];

// Reached files that are left out of the list on purpose.
const excluded = new Map([
  // The generator's own output.
  ['functions/sitemap/bundled-catalog.generated.json', 'the catalog itself'],
  // categoriesHash and categoriesLastmod already cover it; listing it would also move
  // the pages, profiles and templates lastmods on every registry edit.
  ['src/data/publicCategories.ts', 'covered by categoriesHash'],
  // A redirect to /sitemaps/pages/<page>.xml: never cached and lists nothing.
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

function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('.')) base = path.resolve(repoRoot, path.dirname(fromFile), specifier);
  else if (specifier.startsWith('@/')) base = path.resolve(repoRoot, 'src', specifier.slice(2));
  else if (specifier.startsWith('@functions/')) base = path.resolve(repoRoot, 'functions', specifier.slice(11));
  else return null; // A package.
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
      if (resolved && !notWalked.some((prefix) => resolved.startsWith(prefix))) queue.push(resolved);
    }
  }
  return seen;
}

describe('SITEMAP_IMPLEMENTATION_SOURCES', () => {
  // The sitemap route handlers (src/app/sitemap.xml, src/app/sitemaps) and the code they run.
  const entries = [...listFiles('src/app/sitemap.xml'), ...listFiles('src/app/sitemaps'), ...listFiles('functions/sitemap')];

  it('names every module the sitemap functions reach', () => {
    const listed = new Set<string>(SITEMAP_IMPLEMENTATION_SOURCES);
    const missing = [...reachableFiles(entries)]
      .filter((file) => !listed.has(file) && !excluded.has(file))
      .sort();
    expect(missing).toEqual([]);
  });

  it('names only files that exist and are not excluded', () => {
    for (const file of SITEMAP_IMPLEMENTATION_SOURCES) {
      expect(existsSync(path.join(repoRoot, file)), file).toBe(true);
      expect(excluded.has(file), file).toBe(false);
    }
  });
});
