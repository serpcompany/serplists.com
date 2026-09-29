import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { templates, users } from '../../db/schema/index';
import { createDb } from '../api/db';
import type { Env } from '../api/types';
import { withEdgeCache } from '../api/utils/edge-cache';
import { looksLikeTemplateId } from '../api/utils/slug';
import type { PublicTemplateRecord } from './public-page-meta';

// Humans and crawlers both open template pages, so each lookup reads one indexed row
// (idx_templates_slug_unique, or the primary key for an id; a UUID no id matches reads a
// second one by slug), and a found template is cached in the data center for 5 minutes
// like the public catalog (docs/design-docs/d1-cost.md). A template made private can keep
// its preview for that long.
const CACHE_TTL_SECONDS = 5 * 60;

const recordSchema = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  ownerUsername: z.string().nullable(),
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
    })
    .from(templates)
    .leftJoin(users, eq(users.id, templates.user_id))
    // The same visibility rule as GET /api/templates/slug/:slug for a visitor. Unary +
    // keeps the planner on the slug or id index instead of idx_templates_public_created_at.
    .where(and(match, sql`+${templates.is_public} = 1`, isNull(templates.deleted_at)))
    .limit(1);
  return row?.id ? recordSchema.parse(row) : null;
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

/** The public, not deleted template with this slug or id, or null. */
export async function loadPublicTemplate(
  env: Env,
  request: Request,
  identifier: string,
): Promise<PublicTemplateRecord | null> {
  const response = await withEdgeCache(
    new Request(request.url),
    `/__page-meta/templates/${encodeURIComponent(identifier)}`,
    CACHE_TTL_SECONDS,
    async () => {
      const record = await queryPublicTemplate(env, identifier);
      return record ? Response.json(record) : new Response(null, { status: 404 });
    },
  );
  if (!response.ok) return null;
  return recordSchema.parse(await response.json());
}
