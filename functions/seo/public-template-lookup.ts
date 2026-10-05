import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { templates } from '../../db/schema/index';
import { createDb } from '../api/db';
import type { Env } from '../api/types';
import { withEdgeCache } from '../api/utils/edge-cache';
import { selectWithTemplateOwner, templateOwnerOf } from '../api/utils/template-rows';
import { normalizeStringArray } from '../../src/lib/schemas/jsonArrays';
import { looksLikeTemplateId } from '../api/utils/slug';

const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_KEY_PREFIX_NAMING_RECORD_SHAPE = '/__page-meta/v3/templates/';

export interface PublicTemplateRecord {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ownerHandle: string | null;
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
  ownerHandle: z.string().nullable(),
  createdAt: z.string().nullable(),
  categories: z.array(z.string()),
});

const isPublicWithoutItsIndex = sql`+${templates.is_public} = 1`;

async function selectPublicTemplate(env: Env, match: SQL): Promise<PublicTemplateRecord | null> {
  const [row] = await selectWithTemplateOwner(createDb(env), {
    id: templates.id,
    slug: templates.slug,
    title: templates.title,
    description: templates.description,
    seoTitle: templates.seo_title,
    seoDescription: templates.seo_description,
    createdAt: templates.created_at,
    category: templates.category,
    owner_type: templates.owner_type,
    team_id: templates.team_id,
    user_id: templates.user_id,
  })
    .where(and(match, isPublicWithoutItsIndex, isNull(templates.deleted_at)))
    .limit(1);
  if (!row?.id) return null;
  const { id, slug, title, description, seoTitle, seoDescription, createdAt, category } = row;
  return recordSchema.parse({
    id,
    slug,
    title,
    description,
    seoTitle,
    seoDescription,
    createdAt,
    ownerHandle: templateOwnerOf(row).publicHandle,
    categories: normalizeStringArray(category),
  });
}

async function queryPublicTemplate(env: Env, identifier: string): Promise<PublicTemplateRecord | null> {
  if (looksLikeTemplateId(identifier)) {
    const byId = await selectPublicTemplate(env, eq(templates.id, identifier));
    if (byId) return byId;
  }
  return selectPublicTemplate(env, eq(templates.slug, identifier));
}

export async function loadPublicTemplate(
  env: Env,
  origin: string,
  identifier: string,
): Promise<PublicTemplateRecord | null> {
  const response = await withEdgeCache(
    new Request(origin),
    `${CACHE_KEY_PREFIX_NAMING_RECORD_SHAPE}${encodeURIComponent(identifier)}`,
    CACHE_TTL_SECONDS,
    async () => {
      const record = await queryPublicTemplate(env, identifier);
      return record ? Response.json(record) : new Response(null, { status: 404 });
    },
  );
  if (!response.ok) return null;
  return recordSchema.parse(await response.json());
}
