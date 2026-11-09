import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { execScript } from '../../../scripts/lib/run-tool';
import { SITEMAP_IMPLEMENTATION_SOURCES } from '../../../scripts/lib/sitemapLastmod';
import { aGitStandIn } from '../../support/gitStandIn';
import { throwawayRepositoryEnvironment } from '../../support/throwawayGitRepository';
import { z } from 'zod';
import { runRepositoryScript } from '../../support/repositoryScriptRun';
import { parseJsonText } from '../../support/storedJson';

const generator = path.join(process.cwd(), 'scripts', 'generate-sitemap-catalog.ts');
const repo = mkdtempSync(path.join(tmpdir(), 'sitemap-catalog-'));
const hooks = mkdtempSync(path.join(tmpdir(), 'sitemap-catalog-hooks-'));
const elsewhere = mkdtempSync(path.join(tmpdir(), 'sitemap-catalog-elsewhere-'));
const packPath = 'src/data/public-template-packs/foundational.json';
const catalogPath = 'functions/sitemap/bundled-catalog.generated.json';
const filesTheGeneratorReadsGitDatesFrom = [
  'src/views/Index.tsx',
  'src/views/Features.tsx',
  'src/views/Pricing.tsx',
  'src/views/About.tsx',
  'src/views/Contact.tsx',
  'src/views/ChecklistLibrary.tsx',
  'src/views/Categories.tsx',
  'src/views/ProfilesDirectory.tsx',
  'src/data/publicCategories.ts',
  ...SITEMAP_IMPLEMENTATION_SOURCES,
];

const catalogSchema = z
  .object({
    templates: z.array(z.object({ slug: z.string(), lastmod: z.string() }).passthrough()),
    inventory: z
      .object({ templatesLastmod: z.string(), categoriesLastmod: z.string(), implementationLastmod: z.string() })
      .passthrough(),
  })
  .passthrough();

type Catalog = z.output<typeof catalogSchema>;

function write(relativePath: string, content: string) {
  mkdirSync(path.dirname(path.join(repo, relativePath)), { recursive: true });
  writeFileSync(path.join(repo, relativePath), content);
}

function git(args: string[], date?: string, cwd = repo) {
  execFileSync('git', ['-c', `core.hooksPath=${hooks}`, '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    stdio: 'pipe',
    env: throwawayRepositoryEnvironment(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
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
  execScript(generator, [], { cwd: repo, stdio: 'pipe', env: throwawayRepositoryEnvironment({ CI: '' }) });
  return parseJsonText(readFileSync(path.join(repo, catalogPath), 'utf8'), catalogSchema);
}

const lastmodOf = (catalog: Catalog, slug: string) => catalog.templates.find((entry) => entry.slug === slug)?.lastmod;

beforeAll(() => {
  git(['init', '-q']);
  git(['config', 'user.name', 'Sitemap Test']);
  git(['config', 'user.email', 'sitemap-test@example.com']);
  for (const file of filesTheGeneratorReadsGitDatesFrom) write(file, `// ${file}\n`);
  writePack([template('alpha', 'First task'), template('beta', 'Beta task')]);
  commitAll('Add templates', '2026-01-01T00:00:00Z');
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(elsewhere, { recursive: true, force: true });
  rmSync(hooks, { recursive: true, force: true });
});

describe('generate-sitemap-catalog in a throwaway git repository with known commit dates', { timeout: 120_000 }, () => {
  it('dates each template by the commit that last changed it, even after a local build of an uncommitted edit', () => {
    const initial = generate();
    expect(lastmodOf(initial, 'alpha')).toBe('2026-01-01T00:00:00.000Z');
    expect(initial.inventory.templatesLastmod).toBe('2026-01-01T00:00:00.000Z');
    commitAll('Generate catalog', '2026-01-02T00:00:00Z');

    const editStartedAt = Date.now();
    writePack([template('alpha', 'Edited task'), template('beta', 'Beta task')]);
    const localBuildBeforeTheCommit = generate();
    expect(Date.parse(lastmodOf(localBuildBeforeTheCommit, 'alpha') ?? '')).toBeGreaterThanOrEqual(editStartedAt - 1_000);
    expect(lastmodOf(localBuildBeforeTheCommit, 'beta')).toBe('2026-01-01T00:00:00.000Z');

    commitAll('Edit alpha with the catalog that build regenerated', '2026-02-01T00:00:00Z');
    const ciBuildFromTheCleanTree = generate();
    expect(lastmodOf(ciBuildFromTheCleanTree, 'alpha')).toBe('2026-02-01T00:00:00.000Z');
    expect(lastmodOf(ciBuildFromTheCleanTree, 'beta')).toBe('2026-01-01T00:00:00.000Z');
    expect(ciBuildFromTheCleanTree.inventory.templatesLastmod).toBe('2026-02-01T00:00:00.000Z');
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

describe('generate-sitemap-catalog outside a full clone', { timeout: 120_000 }, () => {
  const runGenerator = (cwd: string, args: string[] = [], env: Record<string, string> = { CI: '' }) =>
    runRepositoryScript('scripts/generate-sitemap-catalog.ts', args, { cwd, env: throwawayRepositoryEnvironment(env) });
  const copyOfTheFiles = (name: string, keep: (file: string) => boolean = () => true) => {
    const copy = path.join(elsewhere, name);
    cpSync(repo, copy, { recursive: true, filter: (source) => path.basename(source) !== '.git' && keep(source) });
    return copy;
  };

  it('accepts with --check the catalog it last wrote, and refuses one that differs', () => {
    generate();
    expect(runGenerator(repo, ['--check']).status).toBe(0);

    write(catalogPath, '{}');
    const stale = runGenerator(repo, ['--check']);
    generate();

    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('Generated sitemap catalog is stale. Run `pnpm run sitemap:generate` and commit functions/sitemap/bundled-catalog.generated.json.');
  });

  it('refuses a shallow clone in CI, whose dates would be wrong, and only warns about one on a developer machine', () => {
    const shallow = path.join(elsewhere, 'shallow');
    execFileSync('git', ['clone', '-q', '--depth', '1', pathToFileURL(repo).href, shallow], { stdio: 'pipe', env: throwawayRepositoryEnvironment() });

    const inCi = runGenerator(shallow, [], { CI: 'true' });
    const onAMachine = runGenerator(shallow);

    expect(inCi.status).toBe(1);
    expect(inCi.stderr).toContain('Sitemap lastmod dates need full git history; this clone is shallow (use fetch-depth: 0).');
    expect(onAMachine.status).toBe(0);
    expect(onAMachine.stderr).toContain('Warning: Sitemap lastmod dates need full git history');
  });

  it('keeps the dates of the catalog it finds when there is no git history to read them from', () => {
    generate();
    const before = parseJsonText(readFileSync(path.join(repo, catalogPath), 'utf8'), catalogSchema);

    const copy = copyOfTheFiles('without-git');
    const result = runGenerator(copy);
    const after = parseJsonText(readFileSync(path.join(copy, catalogPath), 'utf8'), catalogSchema);

    expect(result.status).toBe(0);
    expect(after['staticPages']).toEqual(before['staticPages']);
    expect(after.inventory.implementationLastmod).toBe(before.inventory.implementationLastmod);
  });

  it.each([
    ['no earlier catalog', null],
    ['an earlier catalog it cannot read', '{"staticPages": "soon"}'],
    ['an earlier catalog whose dates are not dates', JSON.stringify({ staticPages: [{ path: '/', lastmod: 'last week' }] })],
  ])('fails when git history cannot date a static page and there is %s', (name, catalog) => {
    const copy = copyOfTheFiles(name.replaceAll(' ', '-'), (source) => !source.endsWith('bundled-catalog.generated.json'));
    if (catalog !== null) writeFileSync(path.join(copy, catalogPath), catalog);

    const result = runGenerator(copy);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unable to determine lastmod for static page /');
  });

  it('fails when git history cannot date the sitemap code and the earlier catalog has no date for it', () => {
    generate();
    const { staticPages } = parseJsonText(readFileSync(path.join(repo, catalogPath), 'utf8'), catalogSchema);
    const copy = copyOfTheFiles('without-an-implementation-date');
    writeFileSync(path.join(copy, catalogPath), JSON.stringify({ staticPages }));

    const result = runGenerator(copy);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unable to determine sitemap implementation date');
  });

  it('fails naming a file in the packs folder that is not a template pack', () => {
    const copy = copyOfTheFiles('with-a-stray-pack');
    writeFileSync(path.join(copy, 'src/data/public-template-packs/notes.json'), '[]');

    const result = runGenerator(copy);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/data/public-template-packs/notes.json is not a template pack');
  });

  it('passes over a commit git lists with a date it cannot read, dating the templates by the commits it can', () => {
    const copy = copyOfTheFiles('with-an-undated-commit', (source) => !source.endsWith('bundled-catalog.generated.json'));
    const gitOnThePath = aGitStandIn(path.join(elsewhere, 'undated-commit-git'), copy, {
      'rev-parse': "process.stdout.write('false\\n');\n",
      log: [
        "const listsEachCommit = process.argv.includes('--first-parent');",
        "process.stdout.write(listsEachCommit ? 'beef01\\t2026-02-02T00:00:00Z\\nc0ffee\\tlast tuesday\\n' : '2026-01-01T00:00:00Z\\n');",
        '',
      ].join('\n'),
      'ls-tree': `process.stdout.write(require('node:fs').readdirSync(${JSON.stringify(path.dirname(packPath))}).join('\\n'));\n`,
      show: "process.stdout.write(require('node:fs').readFileSync(process.argv[2].split(':')[1], 'utf8'));\n",
    });

    const result = runGenerator(copy, [], { CI: '', ...gitOnThePath });
    const catalog = parseJsonText(readFileSync(path.join(copy, catalogPath), 'utf8'), catalogSchema);

    expect(result.status).toBe(0);
    expect(catalog.templates.length).toBeGreaterThan(0);
    expect(new Set(catalog.templates.map((entry) => entry.lastmod))).toEqual(new Set(['2026-02-02T00:00:00.000Z']));
  });

  it('reads a history in which the packs and the categories arrived in different commits', () => {
    const copy = copyOfTheFiles('packs-before-categories');
    const inCopy = (args: string[], date: string) => git(args, date, copy);
    inCopy(['init', '-q'], '2026-01-01T00:00:00Z');
    inCopy(['config', 'user.name', 'Sitemap Test'], '2026-01-01T00:00:00Z');
    inCopy(['config', 'user.email', 'sitemap-test@example.com'], '2026-01-01T00:00:00Z');
    inCopy(['add', 'src/data/public-template-packs'], '2026-01-01T00:00:00Z');
    inCopy(['commit', '-q', '-m', 'Add the packs'], '2026-01-01T00:00:00Z');
    inCopy(['rm', '-q', '-r', '--cached', 'src/data/public-template-packs'], '2026-01-02T00:00:00Z');
    inCopy(['add', 'src/data/publicCategories.ts'], '2026-01-02T00:00:00Z');
    inCopy(['commit', '-q', '-m', 'Swap the packs for the categories'], '2026-01-02T00:00:00Z');
    inCopy(['add', '-A'], '2026-01-03T00:00:00Z');
    inCopy(['commit', '-q', '-m', 'Add everything'], '2026-01-03T00:00:00Z');

    const result = runGenerator(copy);

    expect(result.status).toBe(0);
    expect(parseJsonText(readFileSync(path.join(copy, catalogPath), 'utf8'), catalogSchema).inventory.templatesLastmod).toBe('2026-01-03T00:00:00.000Z');
  });
});
