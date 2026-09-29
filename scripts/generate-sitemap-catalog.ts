import { execFile } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  deriveCommittedDates,
  inventoryHashes,
  listPublicTemplates,
  parseTemplatePack,
  resolveLastmod,
  SITEMAP_IMPLEMENTATION_SOURCES,
  type SourceSnapshot,
  type TemplatePack,
} from './lib/sitemapLastmod';
import { matchesGeneratedText } from './lib/line-endings.mjs';

type StaticPage = {
  path: string;
  lastmod: string;
};

const execFileAsync = promisify(execFile);

const repoRoot = process.cwd();
const packsSource = 'src/data/public-template-packs';
const categoriesSourcePath = 'src/data/publicCategories.ts';
const packsDirectory = path.join(repoRoot, packsSource);
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

const optionalText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

// The previous output is only a fallback: for static pages when git has no date, and
// for template content that is not committed yet (see resolveLastmod).
const previousCatalogSchema = z
  .object({
    templates: z.array(z.object({ slug: z.string(), contentHash: z.string(), lastmod: z.string() })),
    staticPages: z.array(z.object({ path: z.string(), lastmod: z.string() })),
    inventory: z.object({
      templatesHash: z.string(),
      templatesLastmod: z.string(),
      categoriesHash: z.string(),
      categoriesLastmod: z.string(),
      implementationLastmod: z.string(),
    }),
  })
  .partial();

let previousCatalog: z.infer<typeof previousCatalogSchema> = {};
try {
  const parsed = previousCatalogSchema.safeParse(JSON.parse(await readFile(outputPath, 'utf8')));
  if (parsed.success) previousCatalog = parsed.data;
} catch {
  // The first generation has no previous artifact to fall back to.
}

const git = async (args: string[]): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
};

const gitLastmod = async (sources: readonly string[]): Promise<string | null> =>
  normalizeDate((await git(['log', '-1', '--format=%aI', '--', ...sources]))?.trim());

// A shallow clone has no history before its tip, so every template would get the tip's date.
if ((await git(['rev-parse', '--is-shallow-repository']))?.trim() === 'true') {
  const message = 'Sitemap lastmod dates need full git history; this clone is shallow (use fetch-depth: 0).';
  if (process.env.CI) throw new Error(message);
  console.warn(`Warning: ${message}`);
}

// The packs and category list at every commit on this branch that changed them, oldest first.
async function readCommittedSnapshots(): Promise<SourceSnapshot[]> {
  const log = await git([
    'log', '--first-parent', '--reverse', '--format=%H%x09%aI', '--', packsSource, categoriesSourcePath,
  ]);
  const snapshots: SourceSnapshot[] = [];
  for (const line of (log ?? '').split('\n').filter(Boolean)) {
    const [sha, rawDate] = line.split('\t');
    const date = normalizeDate(rawDate);
    if (!sha || !date) continue;

    const packNames = ((await git(['ls-tree', '--name-only', `${sha}:${packsSource}`])) ?? '')
      .split('\n')
      .filter((name) => name.endsWith('.json'))
      .sort();
    const packs: TemplatePack[] = [];
    for (const name of packNames) {
      const pack = parseTemplatePack(await git(['show', `${sha}:${packsSource}/${name}`]));
      if (pack) packs.push(pack);
    }
    snapshots.push({ date, packs, categoriesSource: (await git(['show', `${sha}:${categoriesSourcePath}`])) ?? '' });
  }
  return snapshots;
}

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
const currentPacks: TemplatePack[] = [];
for (const fileName of files) {
  const pack = parseTemplatePack(await readFile(path.join(packsDirectory, fileName), 'utf8'));
  if (!pack) throw new Error(`${packsSource}/${fileName} is not a template pack`);
  currentPacks.push(pack);
}

// Page text for link previews (functions/seo/public-page-meta.ts), read from the pack.
const packTemplatesBySlug = new Map<string, Record<string, unknown>>();
for (const pack of currentPacks) {
  for (const template of pack.templates ?? []) {
    const slug = typeof template.slug === 'string' ? template.slug.trim() : '';
    if (slug && template.visibility === 'public') packTemplatesBySlug.set(slug, template);
  }
}
const pageText = (slug: string) => {
  const template = packTemplatesBySlug.get(slug);
  const title = optionalText(template?.title);
  if (!title) throw new Error(`Public template ${slug} has no title`);
  return {
    title,
    description: optionalText(template?.description),
    seoTitle: optionalText(template?.seoTitle),
    seoDescription: optionalText(template?.seoDescription),
  };
};

const committed = deriveCommittedDates(await readCommittedSnapshots());
const now = new Date().toISOString();
const templates = listPublicTemplates(currentPacks).map((template) => {
  const previous = previousCatalog.templates?.find((entry) => entry.slug === template.slug);
  return {
    slug: template.slug,
    ...pageText(template.slug),
    categories: template.categories,
    contentHash: template.contentHash,
    lastmod: resolveLastmod({
      hash: template.contentHash,
      committed: committed.templates.get(template.slug),
      previous: previous && { hash: previous.contentHash, lastmod: normalizeDate(previous.lastmod) },
      now,
    }),
  };
});

const categoriesSource = await readFile(path.join(repoRoot, categoriesSourcePath), 'utf8');
const { templatesHash, categoriesHash } = inventoryHashes(templates, categoriesSource);
const templatesLastmod = resolveLastmod({
  hash: templatesHash,
  committed: committed.templatesInventory,
  previous: {
    hash: previousCatalog.inventory?.templatesHash,
    lastmod: normalizeDate(previousCatalog.inventory?.templatesLastmod),
  },
  now,
});
const categoriesLastmod = resolveLastmod({
  hash: categoriesHash,
  committed: committed.categoriesInventory,
  previous: {
    hash: previousCatalog.inventory?.categoriesHash,
    lastmod: normalizeDate(previousCatalog.inventory?.categoriesLastmod),
  },
  now,
});
const implementationLastmod = await gitLastmod(SITEMAP_IMPLEMENTATION_SOURCES)
  ?? normalizeDate(previousCatalog.inventory?.implementationLastmod);
if (!implementationLastmod) throw new Error('Unable to determine sitemap implementation date');
const output = `${JSON.stringify({
  staticPages,
  templates,
  inventory: { templatesHash, templatesLastmod, categoriesHash, categoriesLastmod, implementationLastmod },
}, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const existing = await readFile(outputPath, 'utf8').catch(() => null);
  if (!matchesGeneratedText(existing, output)) {
    throw new Error(
      'Generated sitemap catalog is stale. Run `pnpm run sitemap:generate` and commit functions/sitemap/bundled-catalog.generated.json.',
    );
  }
} else {
  await writeFile(outputPath, output, 'utf8');
}
console.log(`Generated sitemap catalog from ${files.length} public template pack(s)`);
