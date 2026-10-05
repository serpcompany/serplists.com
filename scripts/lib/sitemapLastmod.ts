import { createHash } from 'node:crypto';
import { z } from 'zod';

import { normalizeEol } from './line-endings';

const templatePackSchema = z
  .object({
    templates: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

export type TemplatePack = z.infer<typeof templatePackSchema>;

interface PackTemplate extends Record<string, unknown> {
  slug?: unknown;
  visibility?: unknown;
  categories?: unknown;
}

const templatesOf = (pack: TemplatePack): PackTemplate[] => pack.templates ?? [];

export type PublicTemplate = { slug: string; categories: string[]; contentHash: string };

export type SourceSnapshot = { date: string; packs: TemplatePack[]; categoriesSource: string };

export type DatedHash = { hash: string; lastmod: string };

export type CommittedDates = {
  templates: Map<string, DatedHash>;
  templatesInventory: DatedHash | null;
  categoriesInventory: DatedHash | null;
};

export const hashJson = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function parseTemplatePack(text: string | null): TemplatePack | null {
  if (text == null) return null;
  try {
    const parsed = templatePackSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function listPublicTemplates(packs: TemplatePack[]): PublicTemplate[] {
  const templates: PublicTemplate[] = [];
  for (const pack of packs) {
    for (const template of templatesOf(pack)) {
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

export function inventoryHashes(templates: PublicTemplate[], categoriesSource: string) {
  return {
    templatesHash: hashJson(templates.map(({ slug, contentHash }) => ({ slug, contentHash }))),
    categoriesHash: hashJson({
      categoriesSource: normalizeEol(categoriesSource),
      templateCategories: templates.map(({ slug, categories }) => ({ slug, categories })),
    }),
  };
}

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

export function resolveLastmod({
  hash,
  committed,
  previous,
  now,
}: {
  hash: string;
  committed: DatedHash | null | undefined;
  previous: { hash?: string | undefined; lastmod?: string | null | undefined } | null | undefined;
  now: string;
}): string {
  if (committed?.hash === hash) return committed.lastmod;
  if (previous?.hash === hash && previous.lastmod) return previous.lastmod;
  return now;
}

const SITEMAP_ROUTE_HANDLERS_AND_WHAT_THEY_HAND_THE_SITEMAP_CODE = [
  'src/app/sitemap.xml/route.ts',
  'src/app/sitemaps/pages/[page]/route.ts',
  'src/app/sitemaps/categories/[page]/route.ts',
  'src/app/sitemaps/profiles/[page]/route.ts',
  'src/app/sitemaps/templates/[page]/route.ts',
  'src/server/sitemapContext.ts',
  'functions/sitemap/routes.ts',
  'functions/sitemap/shared.ts',
  'functions/sitemap/cache.ts',
  'functions/sitemap/listedOwners.ts',
] as const;
const CATEGORY_SLUGS_AND_THE_ORIGIN_EVERY_LOC_STARTS_WITH = [
  'src/lib/categorySlug.ts',
  'src/lib/utils/slug.ts',
  'src/lib/seo/siteOrigin.ts',
] as const;
const THE_CANONICAL_FORM_OF_EVERY_LOC = ['src/lib/http/urlStandard.ts'] as const;
const WHICH_USERNAMES_HAVE_A_PUBLIC_URL = ['src/lib/schemas/publicHandle.ts'] as const;

export const SITEMAP_IMPLEMENTATION_SOURCES = [
  ...SITEMAP_ROUTE_HANDLERS_AND_WHAT_THEY_HAND_THE_SITEMAP_CODE,
  ...CATEGORY_SLUGS_AND_THE_ORIGIN_EVERY_LOC_STARTS_WITH,
  ...THE_CANONICAL_FORM_OF_EVERY_LOC,
  ...WHICH_USERNAMES_HAVE_A_PUBLIC_URL,
] as const;
