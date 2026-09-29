import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { templates, users } from '../../db/schema/index';
import { createDb } from '../api/db';
import type { Env } from '../api/types';
import { withEdgeCache } from '../api/utils/edge-cache';
import { normalizeStringArray } from '../api/utils/payloads';
import { looksLikeTemplateId } from '../api/utils/slug';

// The public template page renders its <head> on the server (title, description, canonical
// URL, link preview), so each request for /profile/<user>/<identifier> reads the template
// here. Humans and crawlers both open template pages, so each lookup reads one indexed row
// (idx_templates_slug_unique, or the primary key for an id; a UUID no id matches reads a
// second one by slug), and a found template is cached in the data center for 5 minutes like
// the public catalog (docs/design-docs/d1-cost.md). A template made private can keep its tags
// for that long; the page itself loads it from the API and shows it as not found.
const CACHE_TTL_SECONDS = 5 * 60;
// Names the record's shape, so a deploy that changes it never reads the previous one.
const CACHE_KEY_PREFIX = '/__page-meta/v2/templates/';

/** A public template as the template page's <head> needs it. */
export interface PublicTemplateRecord {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ownerUsername: string | null;
  createdAt: string | null;
  categories: string[];
}

const recordSchema = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  ownerUsername: z.string().nullable(),
  createdAt: z.string().nullable(),
  categories: z.array(z.string()),
});

async function selectPublicTemplate(env: Env, match: SQL): Promise<PublicTemplateRecord | null> {
  const [row] = await createDb(env)
    .select({
      id: templates.id,
      slug: templates.slug,
      title: templates.title,
      description: templates.description,
      seoTitle: templates.seo_title,
      seoDescription: templates.seo_description,
      ownerUsername: users.username,
      createdAt: templates.created_at,
      category: templates.category,
    })
    .from(templates)
    .leftJoin(users, eq(users.id, templates.user_id))
    // The same visibility rule as GET /api/templates/slug/:slug for a visitor. Unary +
    // keeps the planner on the slug or id index instead of idx_templates_public_created_at.
    .where(and(match, sql`+${templates.is_public} = 1`, isNull(templates.deleted_at)))
    .limit(1);
  if (!row?.id) return null;
  const { category, ...record } = row;
  // The API lists a template's categories the same way.
  return recordSchema.parse({ ...record, categories: normalizeStringArray(category) });
}

// Like the page: a UUID is read as a template id first, then as a slug, since a slug saved
// before the API refused UUID slugs can look like an id. Anything else is a slug.
async function queryPublicTemplate(env: Env, identifier: string): Promise<PublicTemplateRecord | null> {
  if (looksLikeTemplateId(identifier)) {
    const byId = await selectPublicTemplate(env, eq(templates.id, identifier));
    if (byId) return byId;
  }
  return selectPublicTemplate(env, eq(templates.slug, identifier));
}

/**
 * The public, not deleted template with this slug or id, or null. `origin` is the request's,
 * so each host keeps its own cache entries.
 */
export async function loadPublicTemplate(
  env: Env,
  origin: string,
  identifier: string,
): Promise<PublicTemplateRecord | null> {
  const response = await withEdgeCache(
    new Request(origin),
    `${CACHE_KEY_PREFIX}${encodeURIComponent(identifier)}`,
    CACHE_TTL_SECONDS,
    async () => {
      const record = await queryPublicTemplate(env, identifier);
      return record ? Response.json(record) : new Response(null, { status: 404 });
    },
  );
  if (!response.ok) return null;
  return recordSchema.parse(await response.json());
}
