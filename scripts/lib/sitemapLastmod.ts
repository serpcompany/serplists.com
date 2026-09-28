// How the bundled sitemap catalog dates public templates. Dates come from the git
// history of the template packs, never from the committed catalog: a catalog built
// while a pack edit was uncommitted holds the previous commit's date, and trusting it
// would keep that stale date after the edit is committed.
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const templatePackSchema = z
  .object({
    templates: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

export type TemplatePack = z.infer<typeof templatePackSchema>;

export type PublicTemplate = { slug: string; categories: string[]; contentHash: string };

/** One commit that touched the packs or the category list, with the content at that commit. */
export type SourceSnapshot = { date: string; packs: TemplatePack[]; categoriesSource: string };

/** A content hash and when content with that hash was committed. */
export type DatedHash = { hash: string; lastmod: string };

export type CommittedDates = {
  templates: Map<string, DatedHash>;
  templatesInventory: DatedHash | null;
  categoriesInventory: DatedHash | null;
};

export const hashJson = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Parses a pack file; null when it is not valid JSON or not a pack. */
export function parseTemplatePack(text: string | null): TemplatePack | null {
  if (text == null) return null;
  try {
    const parsed = templatePackSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The public templates in the packs, sorted by slug, with a hash of each template's content. */
export function listPublicTemplates(packs: TemplatePack[]): PublicTemplate[] {
  const templates: PublicTemplate[] = [];
  for (const pack of packs) {
    for (const template of pack.templates ?? []) {
      const slug = typeof template.slug === 'string' ? template.slug.trim() : '';
      if (!slug || template.visibility !== 'public') continue;
      templates.push({
        slug,
        categories: Array.isArray(template.categories)
          ? template.categories.filter((value): value is string => typeof value === 'string')
          : [],
        contentHash: hashJson(template),
      });
    }
  }
  return templates.sort((left, right) => left.slug.localeCompare(right.slug));
}

/** Hashes for the /templates and /categories inventories. */
export function inventoryHashes(templates: PublicTemplate[], categoriesSource: string) {
  return {
    templatesHash: hashJson(templates.map(({ slug, contentHash }) => ({ slug, contentHash }))),
    categoriesHash: hashJson({
      // Line endings depend on the checkout, not the content.
      categoriesSource: categoriesSource.replace(/\r\n/g, '\n'),
      templateCategories: templates.map(({ slug, categories }) => ({ slug, categories })),
    }),
  };
}

/**
 * Walks the snapshots from oldest to newest and records, for the newest committed
 * content, the date of the commit that last changed it: per template (so editing one
 * template leaves its siblings' dates alone), and for each inventory. A template that
 * is removed or made private and later returns counts as changed.
 */
export function deriveCommittedDates(snapshots: SourceSnapshot[]): CommittedDates {
  const templates = new Map<string, DatedHash>();
  let templatesInventory = null as DatedHash | null;
  let categoriesInventory = null as DatedHash | null;

  for (const snapshot of snapshots) {
    const current = listPublicTemplates(snapshot.packs);
    const present = new Set(current.map(({ slug }) => slug));
    for (const slug of templates.keys()) {
      if (!present.has(slug)) templates.delete(slug);
    }
    for (const template of current) {
      if (templates.get(template.slug)?.hash !== template.contentHash) {
        templates.set(template.slug, { hash: template.contentHash, lastmod: snapshot.date });
      }
    }

    const { templatesHash, categoriesHash } = inventoryHashes(current, snapshot.categoriesSource);
    if (templatesInventory?.hash !== templatesHash) {
      templatesInventory = { hash: templatesHash, lastmod: snapshot.date };
    }
    if (categoriesInventory?.hash !== categoriesHash) {
      categoriesInventory = { hash: categoriesHash, lastmod: snapshot.date };
    }
  }

  return { templates, templatesInventory, categoriesInventory };
}

/**
 * The lastmod for content with `hash`. Committed content gets the date of the commit
 * that last changed it. Uncommitted content (a local edit or a new pack) gets the time
 * it was first generated, kept while the content stays the same, and never an older
 * commit's date; the first build after the commit replaces it with the commit date.
 */
export function resolveLastmod({
  hash,
  committed,
  previous,
  now,
}: {
  hash: string;
  committed: DatedHash | null | undefined;
  previous: { hash?: string; lastmod?: string | null } | null | undefined;
  now: string;
}): string {
  if (committed?.hash === hash) return committed.lastmod;
  if (previous?.hash === hash && previous.lastmod) return previous.lastmod;
  return now;
}
