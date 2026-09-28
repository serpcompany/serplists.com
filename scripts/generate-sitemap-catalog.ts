import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

type SitemapTemplate = {
  slug: string;
  categories: string[];
  contentHash: string;
  lastmod: string;
};

type StaticPage = {
  path: string;
  lastmod: string;
};

type GeneratedCatalog = {
  templates?: SitemapTemplate[];
  staticPages?: StaticPage[];
  inventory?: {
    templatesHash: string;
    templatesLastmod: string;
    categoriesHash: string;
    categoriesLastmod: string;
    implementationLastmod: string;
  };
};

const execFileAsync = promisify(execFile);

const repoRoot = process.cwd();
const packsDirectory = path.join(repoRoot, 'src/data/public-template-packs');
const outputPath = path.join(
  repoRoot,
  'functions/sitemap/bundled-catalog.generated.json',
);
const staticPageSources = [
  { path: '/', sources: ['src/pages/Index.tsx'] },
  { path: '/features', sources: ['src/pages/Features.tsx'] },
  { path: '/features/template-builder', sources: ['src/pages/Features.tsx'] },
  { path: '/features/checklist-runs', sources: ['src/pages/Features.tsx'] },
  { path: '/features/public-sharing', sources: ['src/pages/Features.tsx'] },
  { path: '/features/import-export', sources: ['src/pages/Features.tsx'] },
  { path: '/pricing', sources: ['src/pages/Pricing.tsx'] },
  { path: '/about', sources: ['src/pages/About.tsx'] },
  { path: '/contact', sources: ['src/pages/Contact.tsx'] },
  { path: '/templates', sources: ['src/pages/ChecklistLibrary.tsx'] },
  { path: '/categories', sources: ['src/pages/Categories.tsx'] },
] as const;

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

let previousCatalog: GeneratedCatalog = {};
try {
  previousCatalog = JSON.parse(await readFile(outputPath, 'utf8')) as GeneratedCatalog;
} catch {
  // The first generation has no previous artifact to fall back to.
}

const gitLastmod = async (sources: readonly string[]): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-1', '--format=%aI', '--', ...sources],
      { cwd: repoRoot },
    );
    return normalizeDate(stdout.trim());
  } catch {
    return null;
  }
};

const staticPages: StaticPage[] = [];
for (const page of staticPageSources) {
  const previous = previousCatalog.staticPages?.find((entry) => entry.path === page.path);
  const lastmod = await gitLastmod(page.sources) ?? normalizeDate(previous?.lastmod);
  if (!lastmod) throw new Error(`Unable to determine lastmod for static page ${page.path}`);
  staticPages.push({ path: page.path, lastmod });
}

const files = (await readdir(packsDirectory))
  .filter((fileName) => fileName.endsWith('.json'))
  .sort();
const templates: SitemapTemplate[] = [];

for (const fileName of files) {
  const pack = JSON.parse(
    await readFile(path.join(packsDirectory, fileName), 'utf8'),
  ) as { exportedAt?: string; templates?: Array<Record<string, unknown>> };
  const packGitLastmod = await gitLastmod([
    path.relative(repoRoot, path.join(packsDirectory, fileName)),
  ]);
  const packFallbackLastmod = normalizeDate(pack.exportedAt);

  for (const template of pack.templates ?? []) {
    const slug = typeof template.slug === 'string' ? template.slug.trim() : '';
    const visibility = template.visibility;
    if (!slug || visibility !== 'public') continue;
    const contentHash = createHash('sha256')
      .update(JSON.stringify(template))
      .digest('hex');
    const previous = previousCatalog.templates?.find((entry) => entry.slug === slug);
    const lastmod = previous?.contentHash === contentHash
      ? normalizeDate(previous.lastmod)
      : packGitLastmod ?? packFallbackLastmod;
    if (!lastmod) throw new Error(`Unable to determine lastmod for ${slug}`);

    templates.push({
      slug,
      categories: Array.isArray(template.categories)
        ? template.categories.filter((value): value is string => typeof value === 'string')
        : [],
      contentHash,
      lastmod,
    });
  }
}

templates.sort((left, right) => left.slug.localeCompare(right.slug));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const templatesHash = hash(templates.map(({ slug, contentHash }) => ({ slug, contentHash })));
const categoriesSource = await readFile(
  path.join(repoRoot, 'src/data/publicCategories.ts'),
  'utf8',
);
const categoriesHash = hash({
  categoriesSource,
  templateCategories: templates.map(({ slug, categories }) => ({ slug, categories })),
});
const templateSources = ['src/data/public-template-packs'] as const;
const categorySources = [...templateSources, 'src/data/publicCategories.ts'] as const;
const templateSourcesLastmod = await gitLastmod(templateSources);
const categorySourcesLastmod = await gitLastmod(categorySources);
const changedLastmod = (gitDate: string | null, previous?: string) =>
  gitDate ?? normalizeDate(previous);
const templatesLastmod = previousCatalog.inventory?.templatesHash === templatesHash
  ? normalizeDate(previousCatalog.inventory.templatesLastmod)
  : changedLastmod(templateSourcesLastmod, previousCatalog.inventory?.templatesLastmod);
const categoriesLastmod = previousCatalog.inventory?.categoriesHash === categoriesHash
  ? normalizeDate(previousCatalog.inventory.categoriesLastmod)
  : changedLastmod(categorySourcesLastmod, previousCatalog.inventory?.categoriesLastmod);
if (!templatesLastmod || !categoriesLastmod) {
  throw new Error('Unable to determine sitemap inventory modification dates');
}
const implementationLastmod = await gitLastmod([
  'functions/sitemap.xml.ts',
  'functions/sitemap/shared.ts',
  'functions/sitemaps/pages/[page].xml.ts',
  'functions/sitemaps/categories/[page].xml.ts',
  'functions/sitemaps/profiles/[page].xml.ts',
  'functions/sitemaps/templates/[page].xml.ts',
]) ?? normalizeDate(previousCatalog.inventory?.implementationLastmod);
if (!implementationLastmod) throw new Error('Unable to determine sitemap implementation date');
const output = `${JSON.stringify({
  staticPages,
  templates,
  inventory: { templatesHash, templatesLastmod, categoriesHash, categoriesLastmod, implementationLastmod },
}, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const existing = await readFile(outputPath, 'utf8').catch(() => '');
  if (existing !== output) {
    throw new Error(
      'Generated sitemap catalog is stale. Run `pnpm run sitemap:generate` and commit functions/sitemap/bundled-catalog.generated.json.',
    );
  }
} else {
  await writeFile(outputPath, output, 'utf8');
}
console.log(`Generated sitemap catalog from ${files.length} public template pack(s)`);
