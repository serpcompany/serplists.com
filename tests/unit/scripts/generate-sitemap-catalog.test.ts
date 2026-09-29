import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { execTool } from '../../../scripts/lib/run-tool.mjs';
import { SITEMAP_IMPLEMENTATION_SOURCES } from '../../../scripts/lib/sitemapLastmod';

// Runs the real generator in a throwaway git repository whose commits have known dates.

const generator = path.join(process.cwd(), 'scripts', 'generate-sitemap-catalog.ts');
const repo = mkdtempSync(path.join(tmpdir(), 'sitemap-catalog-'));
const hooks = mkdtempSync(path.join(tmpdir(), 'sitemap-catalog-hooks-'));
const packPath = 'src/data/public-template-packs/foundational.json';
const catalogPath = 'functions/sitemap/bundled-catalog.generated.json';
// Every file the generator reads a git date from.
const sourceFiles = [
  'src/views/Index.tsx',
  'src/views/Features.tsx',
  'src/views/Pricing.tsx',
  'src/views/About.tsx',
  'src/views/Contact.tsx',
  'src/views/ChecklistLibrary.tsx',
  'src/views/Categories.tsx',
  'src/data/publicCategories.ts',
  ...SITEMAP_IMPLEMENTATION_SOURCES,
];

type Catalog = {
  templates: Array<{ slug: string; lastmod: string }>;
  inventory: { templatesLastmod: string; categoriesLastmod: string; implementationLastmod: string };
};

function write(relativePath: string, content: string) {
  mkdirSync(path.dirname(path.join(repo, relativePath)), { recursive: true });
  writeFileSync(path.join(repo, relativePath), content);
}

function git(args: string[], date?: string) {
  execFileSync('git', ['-c', `core.hooksPath=${hooks}`, '-c', 'commit.gpgsign=false', ...args], {
    cwd: repo,
    stdio: 'pipe',
    env: date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env,
  });
}

function commitAll(message: string, date: string) {
  git(['add', '-A']);
  git(['commit', '-q', '-m', message], date);
}

function template(slug: string, taskTitle: string, visibility = 'public') {
  return { slug, visibility, title: slug, categories: ['Testing'], sections: [{ title: 'Section', items: [{ title: taskTitle }] }] };
}

function writePack(templates: unknown[], file = packPath) {
  write(file, `${JSON.stringify({ exportedAt: '2025-01-01T00:00:00.000Z', templates }, null, 2)}\n`);
}

function generate(): Catalog {
  execTool('tsx', [generator], { cwd: repo, stdio: 'pipe', env: { ...process.env, CI: '' } });
  return JSON.parse(readFileSync(path.join(repo, catalogPath), 'utf8')) as Catalog;
}

const lastmodOf = (catalog: Catalog, slug: string) => catalog.templates.find((entry) => entry.slug === slug)?.lastmod;

beforeAll(() => {
  git(['init', '-q']);
  git(['config', 'user.name', 'Sitemap Test']);
  git(['config', 'user.email', 'sitemap-test@example.com']);
  for (const file of sourceFiles) write(file, `// ${file}\n`);
  writePack([template('alpha', 'First task'), template('beta', 'Beta task')]);
  commitAll('Add templates', '2026-01-01T00:00:00Z');
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(hooks, { recursive: true, force: true });
});

describe('generate-sitemap-catalog', { timeout: 120_000 }, () => {
  it('dates each template by the commit that last changed it, even after a local build of an uncommitted edit', () => {
    const initial = generate();
    expect(lastmodOf(initial, 'alpha')).toBe('2026-01-01T00:00:00.000Z');
    expect(initial.inventory.templatesLastmod).toBe('2026-01-01T00:00:00.000Z');
    commitAll('Generate catalog', '2026-01-02T00:00:00Z');

    // Edit alpha and build before committing, as test:smoke or build:dev do.
    const editStartedAt = Date.now();
    writePack([template('alpha', 'Edited task'), template('beta', 'Beta task')]);
    const dirty = generate();
    expect(Date.parse(lastmodOf(dirty, 'alpha') ?? '')).toBeGreaterThanOrEqual(editStartedAt - 1_000);
    expect(lastmodOf(dirty, 'beta')).toBe('2026-01-01T00:00:00.000Z');

    // The regenerated catalog is committed with the edit; CI then rebuilds from a clean tree.
    commitAll('Edit alpha', '2026-02-01T00:00:00Z');
    const clean = generate();
    expect(lastmodOf(clean, 'alpha')).toBe('2026-02-01T00:00:00.000Z');
    expect(lastmodOf(clean, 'beta')).toBe('2026-01-01T00:00:00.000Z');
    expect(clean.inventory.templatesLastmod).toBe('2026-02-01T00:00:00.000Z');
  });

  it('dates a new pack by its commit, not its exportedAt', () => {
    const newPack = 'src/data/public-template-packs/more.json';
    writePack([template('gamma', 'Gamma task')], newPack);
    expect(lastmodOf(generate(), 'gamma')).not.toBe('2025-01-01T00:00:00.000Z');

    commitAll('Add gamma', '2026-03-01T00:00:00Z');
    const clean = generate();
    expect(lastmodOf(clean, 'gamma')).toBe('2026-03-01T00:00:00.000Z');
    expect(lastmodOf(clean, 'alpha')).toBe('2026-02-01T00:00:00.000Z');
  });

  it('advances the inventory dates when a template is removed or categories change', () => {
    writePack([template('alpha', 'Edited task')]);
    write('src/data/publicCategories.ts', '// categories, edited\n');
    commitAll('Remove beta and edit categories', '2026-04-01T00:00:00Z');

    const clean = generate();
    expect(lastmodOf(clean, 'beta')).toBeUndefined();
    expect(clean.inventory.templatesLastmod).toBe('2026-04-01T00:00:00.000Z');
    expect(clean.inventory.categoriesLastmod).toBe('2026-04-01T00:00:00.000Z');
    expect(lastmodOf(clean, 'alpha')).toBe('2026-02-01T00:00:00.000Z');
  });

  it('advances the implementation date when the category slug rule changes', () => {
    write('src/lib/utils/slug.ts', '// slug rule, edited\n');
    commitAll('Fold another letter', '2026-05-01T00:00:00Z');

    expect(generate().inventory.implementationLastmod).toBe('2026-05-01T00:00:00.000Z');
  });

  it('writes the same catalog on every clean run', () => {
    const first = readFileSync(path.join(repo, catalogPath), 'utf8');
    generate();
    expect(readFileSync(path.join(repo, catalogPath), 'utf8')).toBe(first);
  });
});
