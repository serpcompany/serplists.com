import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type SitemapTemplate = {
  slug: string;
  categories: string[];
};

const repoRoot = process.cwd();
const packsDirectory = path.join(repoRoot, 'src/data/public-template-packs');
const outputPath = path.join(
  repoRoot,
  'functions/sitemap/bundled-catalog.generated.json',
);

const files = (await readdir(packsDirectory))
  .filter((fileName) => fileName.endsWith('.json'))
  .sort();
const templates: SitemapTemplate[] = [];

for (const fileName of files) {
  const pack = JSON.parse(
    await readFile(path.join(packsDirectory, fileName), 'utf8'),
  ) as { templates?: Array<Record<string, unknown>> };

  for (const template of pack.templates ?? []) {
    const slug = typeof template.slug === 'string' ? template.slug.trim() : '';
    const visibility = template.visibility;
    if (!slug || visibility !== 'public') continue;

    templates.push({
      slug,
      categories: Array.isArray(template.categories)
        ? template.categories.filter((value): value is string => typeof value === 'string')
        : [],
    });
  }
}

templates.sort((left, right) => left.slug.localeCompare(right.slug));
await writeFile(outputPath, `${JSON.stringify({ templates }, null, 2)}\n`, 'utf8');
console.log(`Generated sitemap catalog from ${files.length} public template pack(s)`);
