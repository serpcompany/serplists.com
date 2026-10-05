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
import { matchesGeneratedText } from './lib/line-endings';
import { withoutGitRepositoryOverrides } from './lib/git-env';

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
  { path: '/', sources: ['src/views/Index.tsx'] },
  { path: '/features/', sources: ['src/views/Features.tsx', 'src/data/publicFeatures.ts'] },
  { path: '/features/template-builder/', sources: ['src/views/Features.tsx', 'src/data/publicFeatures.ts'] },
  { path: '/features/checklist-runs/', sources: ['src/views/Features.tsx', 'src/data/publicFeatures.ts'] },
  { path: '/features/public-sharing/', sources: ['src/views/Features.tsx', 'src/data/publicFeatures.ts'] },
  { path: '/features/import-export/', sources: ['src/views/Features.tsx', 'src/data/publicFeatures.ts'] },
  { path: '/pricing/', sources: ['src/views/Pricing.tsx'] },
  { path: '/about/', sources: ['src/views/About.tsx'] },
  { path: '/contact/', sources: ['src/views/Contact.tsx'] },
  { path: '/templates/', sources: ['src/views/ChecklistLibrary.tsx'] },
  { path: '/categories/', sources: ['src/views/Categories.tsx'] },
  { path: '/profiles/', sources: ['src/views/ProfilesDirectory.tsx'] },
] as const;

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

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

async function readPreviousCatalogIfAny(): Promise<z.infer<typeof previousCatalogSchema>> {
  try {
    const parsed = previousCatalogSchema.safeParse(JSON.parse(await readFile(outputPath, 'utf8')));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

const previousCatalog = await readPreviousCatalogIfAny();

const git = async (args: string[]): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: repoRoot, env: withoutGitRepositoryOverrides(), maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
};

const gitLastmod = async (sources: readonly string[]): Promise<string | null> =>
  normalizeDate((await git(['log', '-1', '--format=%aI', '--', ...sources]))?.trim());

const isShallowClone = (await git(['rev-parse', '--is-shallow-repository']))?.trim() === 'true';
if (isShallowClone) {
  const message = 'Sitemap lastmod dates need full git history; this clone is shallow (use fetch-depth: 0).';
  if (process.env['CI']) throw new Error(message);
  console.warn(`Warning: ${message}`);
}

async function readEachFirstParentCommitOfThePacksOrCategoriesOldestFirst(): Promise<SourceSnapshot[]> {
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

const committed = deriveCommittedDates(await readEachFirstParentCommitOfThePacksOrCategoriesOldestFirst());
const now = new Date().toISOString();
const templates = listPublicTemplates(currentPacks).map((template) => {
  const previous = previousCatalog.templates?.find((entry) => entry.slug === template.slug);
  return {
    slug: template.slug,
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
