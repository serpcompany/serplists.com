import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CATALOG_CONSUMERS = ['src/hooks/useTemplateLibrary.ts', 'src/views/Dashboard.tsx'];

const repoRoot = path.resolve(__dirname, '../../..');

const listSourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return listSourceFiles(fullPath);
    }
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });

describe('public catalog consumers', () => {
  it('loads the catalog only on the pages that show it, since an edge-cache miss reads every public Template from D1', () => {
    const consumers = listSourceFiles(path.join(repoRoot, 'src'))
      .filter((file) => /useTemplateLists\(\s*\{[^}]*catalog:\s*true/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))
      .sort();

    expect(consumers).toEqual(CATALOG_CONSUMERS);
  });
});

describe('public catalog pages, whose library list always holds the bundled starter templates', () => {
  it('handle the catalog loading and failing on every page that uses the library, so the bundled templates never pass for the whole catalog', () => {
    const pages = listSourceFiles(path.join(repoRoot, 'src'))
      .filter((file) => !file.endsWith(path.join('hooks', 'useTemplateLibrary.ts')))
      .filter((file) => /useTemplateLibrary\(/.test(readFileSync(file, 'utf8')));

    expect(pages.length).toBeGreaterThan(0);
    for (const file of pages) {
      const source = readFileSync(file, 'utf8');
      const name = path.relative(repoRoot, file).split(path.sep).join('/');
      expect(source, name).toMatch(/\bloading\b/);
      expect(source, name).toMatch(/\bcatalogError\b/);
      expect(source, name).toMatch(/<CatalogLoadError\b[^>]*onRetry=\{retryCatalog\}/);
    }
  });
});
