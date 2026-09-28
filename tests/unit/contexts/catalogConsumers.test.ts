import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The public catalog (?scope=public) holds every public Template with its sections, and an
// edge-cache miss reads all of them from D1 (docs/design-docs/d1-cost.md). Only pages that
// display the catalog may load it. Adding a caller here is a deliberate, reviewed change.
const CATALOG_CONSUMERS = ['src/hooks/useTemplateLibrary.ts', 'src/pages/Dashboard.tsx'];

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
  it('loads the catalog only on pages that show it', () => {
    const consumers = listSourceFiles(path.join(repoRoot, 'src'))
      .filter((file) => /useTemplateLists\(\s*\{[^}]*catalog:\s*true/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))
      .sort();

    expect(consumers).toEqual(CATALOG_CONSUMERS);
  });
});
