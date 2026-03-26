import { Env } from '../types';
import { generateSlug } from '../utils/slug';
import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { normalizeSectionsPayload, normalizeStringArray, templatePayloadSchema } from '../utils/payloads';
import { json, jsonError } from '../utils/response';
import { getSessionUserId } from '../utils/session';
import { getEntitlementsForUser } from '../utils/entitlements';
import { z } from 'zod';
import {
  PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  portableTemplatePackEnvelopeSchema,
  portableTemplateRuleSchema,
} from '../../../src/lib/schemas/checklistSchema';

const junkTemplateTitles = new Set(['Test Template', 'Updated Template Title']);

async function generateUniqueSlug(env: Env, title: string, templateId: string): Promise<string> {
  const base = generateSlug(title || 'template') || 'template';
  const db = createDb(env);
  const { templates } = schema;

  // Prefer the clean slug if available; otherwise fall back to a deterministic suffix.
  const [exists] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.slug, base))
    .limit(1);

  if (!exists) return base;

  const suffixed = `${base}-${templateId.slice(0, 8)}`;
  const [existsSuffixed] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.slug, suffixed))
    .limit(1);

  if (!existsSuffixed) return suffixed;

  // Extremely unlikely collision; use random suffix.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function parseTemplateRow(template: Record<string, unknown>) {
  let sections: unknown[] = [];
  if (typeof template.items !== 'undefined') {
    const normalized = normalizeSectionsPayload(template.items);
    if (normalized.error) {
      console.warn('Failed to parse template items JSON', { templateId: template.id });
    } else {
      sections = normalized.sections;
    }
  }

  let rules: unknown[] | undefined;
  if (typeof template.rules !== 'undefined' && template.rules !== null) {
    try {
      const parsedRules = typeof template.rules === 'string' ? JSON.parse(template.rules) : template.rules;
      const validatedRules = z.array(portableTemplateRuleSchema).safeParse(parsedRules);
      if (validatedRules.success) {
        rules = validatedRules.data;
      }
    } catch {
      console.warn('Failed to parse template rules JSON', { templateId: template.id });
    }
  }

  return {
    ...template,
    sections,
    rules,
    categories: normalizeStringArray(template.category),
    tags: normalizeStringArray(template.tags),
    seoTitle: typeof template.seo_title === 'string' ? template.seo_title : '',
    seoDescription: typeof template.seo_description === 'string' ? template.seo_description : '',
    type: typeof template.type === 'string' ? template.type : 'checklist',
    ownerProfile:
      typeof template.owner_username === 'string' || typeof template.owner_full_name === 'string'
        ? {
            username: typeof template.owner_username === 'string' ? template.owner_username : undefined,
            full_name: typeof template.owner_full_name === 'string' ? template.owner_full_name : undefined,
          }
        : undefined,
  };
}

function selectTemplatesWithOwner(env: Env) {
  const db = createDb(env);
  const { templates, users } = schema;

  return db
    .select({
      id: templates.id,
      user_id: templates.user_id,
      title: templates.title,
      description: templates.description,
      items: templates.items,
      version: templates.version,
      type: templates.type,
      seo_title: templates.seo_title,
      seo_description: templates.seo_description,
      rules: templates.rules,
      is_public: templates.is_public,
      category: templates.category,
      tags: templates.tags,
      slug: templates.slug,
      created_at: templates.created_at,
      updated_at: templates.updated_at,
      owner_username: users.username,
      owner_full_name: users.name,
    })
    .from(templates)
    .leftJoin(users, eq(users.id, templates.user_id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const templateBackupImportTemplateSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  type: z.enum(['checklist', 'recipe']).optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  sections: z.unknown().optional(),
  items: z.unknown().optional(),
  isPublic: z.boolean().optional(),
  is_public: z.boolean().optional(),
  categories: z.union([z.array(z.string()), z.string()]).optional(),
  category: z.string().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  slug: z.string().optional(),
  version: z.number().int().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  rules: z.array(z.object({
    id: z.string(),
    type: z.string(),
    path: z.string(),
    value: z.unknown().optional(),
    severity: z.enum(['error', 'warning']).optional(),
  })).optional(),
});

const templateBackupImportBodySchema = z.object({
  templates: z.array(templateBackupImportTemplateSchema),
  options: z
    .object({
      visibility: z.enum(['preserve', 'public', 'private']).optional(),
    })
    .optional(),
});

type TemplateImportFailureCode = 'invalid_sections' | 'oversized_asset' | 'insert_failed';

type TemplateImportFailure = {
  index: number;
  title: string;
  reason: string;
  code: TemplateImportFailureCode;
};

type TemplateImportSuccess = {
  index: number;
  title: string;
  id: string;
  slug: string;
  visibility: 'public' | 'private';
};

type TemplateImportSummary = {
  total: number;
  imported: number;
  failed: TemplateImportFailure[];
  successes: TemplateImportSuccess[];
};

function hasOversizedAssets(sections: unknown[], maxAssetBytes: number): boolean {
  for (const section of sections) {
    if (!isRecord(section)) continue;
    const items = section.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!isRecord(item)) continue;
      const contents = item.contents;
      if (!Array.isArray(contents)) continue;
      for (const content of contents) {
        if (!isRecord(content)) continue;
        const type = content.type;
        if (type !== 'image' && type !== 'video' && type !== 'file') continue;
        const fileSize = content.fileSize;
        if (typeof fileSize === 'number' && fileSize > maxAssetBytes) return true;
      }
    }
  }
  return false;
}

function countReferencedUploads(sections: unknown[]): number {
  let count = 0;

  for (const section of sections) {
    if (!isRecord(section)) continue;
    const items = section.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!isRecord(item)) continue;
      const contents = item.contents;
      if (!Array.isArray(contents)) continue;
      for (const content of contents) {
        if (!isRecord(content)) continue;
        const type = content.type;
        const value = typeof content.value === 'string' ? content.value : '';
        const isUpload = content.uploadType === 'upload' || value.includes('/api/uploads/file') || value.includes('uploads/file?key=');
        if ((type === 'image' || type === 'video' || type === 'file') && isUpload) {
          count += 1;
        }
      }
    }
  }

  return count;
}

export async function handleTemplates(request: Request, env: Env): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "templates", ...]
  const templatesSubpath = pathParts.slice(2); // after /api/templates
  const db = createDb(env);
  const { templates, users, checklist_runs } = schema;

  // Pro-only: export/import templates as JSON backup
  // GET  /api/templates/backup?includePublic=1
  // POST /api/templates/backup  { templates: [...], options?: { visibility } }
  if (templatesSubpath[0] === 'backup') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const entitlements = await getEntitlementsForUser(env, userId);
    if (entitlements.plan !== 'pro') {
      return jsonError('Upgrade to Pro to use template import/export.', 403, { code: 'upgrade_required' });
    }

    if (request.method === 'GET') {
      const exportFormat = url.searchParams.get('format') === 'backup' ? 'backup' : 'portable';
      const includePublic = url.searchParams.get('includePublic') === '1';
      const whereClause = includePublic
        ? or(eq(templates.user_id, userId), eq(templates.is_public, true))
        : eq(templates.user_id, userId);

      const rows = await db
        .select()
        .from(templates)
        .where(whereClause)
        .orderBy(desc(templates.created_at));

      const [userRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);

      const exportedTemplates = rows.map((row) => {
        const parsed = parseTemplateRow(row as unknown as Record<string, unknown>);
        return {
          id: parsed.id,
          title: parsed.title,
          description: parsed.description || '',
          type: typeof parsed.type === 'string' ? parsed.type : 'checklist',
          seoTitle: typeof parsed.seoTitle === 'string' ? parsed.seoTitle : '',
          seoDescription: typeof parsed.seoDescription === 'string' ? parsed.seoDescription : '',
          rules: Array.isArray(parsed.rules) ? parsed.rules : undefined,
          sections: parsed.sections || [],
          categories: parsed.categories || [],
          tags: parsed.tags || [],
          userId: parsed.user_id,
          createdAt: parsed.created_at,
          updatedAt: parsed.updated_at || parsed.created_at,
          isPublic: Boolean(parsed.is_public),
          slug: parsed.slug || '',
          version: typeof parsed.version === 'number' ? parsed.version : 1,
        };
      });

      const publicTemplates = exportedTemplates.filter((t) => t.isPublic);
      const privateTemplates = exportedTemplates.filter((t) => !t.isPublic);

      if (exportFormat === 'portable') {
        return json({
          kind: 'serplists-template-pack',
          schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          exportedBy: userRow?.email,
          templates: exportedTemplates.map((template) => ({
            title: template.title,
            description: template.description || '',
            type: typeof template.type === 'string' ? template.type : 'checklist',
            seoTitle: template.seoTitle || '',
            seoDescription: template.seoDescription || '',
            rules: template.rules,
            sections: template.sections || [],
            categories: template.categories || [],
            tags: template.tags || [],
            visibility: template.isPublic ? 'public' : 'private',
            slug: template.slug || undefined,
          })),
          manifest: {
            totalTemplates: exportedTemplates.length,
            format: 'portable',
            includesVisibility: exportedTemplates.length > 0,
            includesRules: exportedTemplates.some((template) => Array.isArray(template.rules) && template.rules.length > 0),
            assetWarnings: exportedTemplates.reduce((total, template) => total + countReferencedUploads(template.sections || []), 0),
          },
        });
      }

      return json({
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        exportedBy: userRow?.email,
        templates: exportedTemplates,
        metadata: {
          totalTemplates: exportedTemplates.length,
          publicTemplates: publicTemplates.length,
          privateTemplates: privateTemplates.length,
        },
      });
    }

    if (request.method === 'POST') {
      const MAX_TEMPLATES_PER_IMPORT = 5;
      const MAX_ASSET_BYTES = 5 * 1024 * 1024;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonError('Invalid JSON payload', 400);
      }

      if (isRecord(body) && body.kind === 'serplists-template-pack') {
        const portableBody = portableTemplatePackEnvelopeSchema.safeParse(body);
        if (!portableBody.success) {
          return jsonError(portableBody.error.issues[0]?.message || 'Invalid portable template pack payload', 400);
        }
        if (portableBody.data.schemaVersion !== PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION) {
          return jsonError(`Unsupported portable template schema version: ${portableBody.data.schemaVersion}`, 400, {
            code: 'unsupported_portable_schema_version',
          });
        }

        body = { templates: portableBody.data.templates };
      }

      const parsedBody = Array.isArray(body)
        ? templateBackupImportBodySchema.safeParse({ templates: body })
        : templateBackupImportBodySchema.safeParse(body);

      if (!parsedBody.success) {
        return jsonError(parsedBody.error.issues[0]?.message || 'Invalid template import payload', 400);
      }

      const { templates: incomingTemplates, options } = parsedBody.data;

      if (incomingTemplates.length > MAX_TEMPLATES_PER_IMPORT) {
        return jsonError(`Import limited to ${MAX_TEMPLATES_PER_IMPORT} templates per file for now`, 400, {
          code: 'import_limit',
          details: { limit: MAX_TEMPLATES_PER_IMPORT, current: incomingTemplates.length },
        });
      }

      const visibility = options?.visibility ?? 'preserve';

      const summary: TemplateImportSummary = {
        total: incomingTemplates.length,
        imported: 0,
        failed: [],
        successes: [],
      };

      for (const [index, template] of incomingTemplates.entries()) {
        const normalizedSections = normalizeSectionsPayload(template.sections ?? template.items);
        if (normalizedSections.error) {
          summary.failed.push({
            index,
            title: template.title,
            reason: normalizedSections.error,
            code: 'invalid_sections',
          });
          continue;
        }

        if (hasOversizedAssets(normalizedSections.sections, MAX_ASSET_BYTES)) {
          summary.failed.push({
            index,
            title: template.title,
            reason: 'Import blocked: one or more assets are over 5MB',
            code: 'oversized_asset',
          });
          continue;
        }

        const finalCategories = normalizeStringArray(template.categories ?? template.category);
        const finalTags = normalizeStringArray(template.tags);
        const finalType = template.type ?? 'checklist';
        const sourceVisibility =
          template.visibility === 'public'
            ? true
            : template.visibility === 'private'
              ? false
              : typeof template.is_public === 'boolean'
            ? template.is_public
            : typeof template.isPublic === 'boolean'
              ? template.isPublic
              : false;

        const isPublic =
          visibility === 'public' ? true : visibility === 'private' ? false : sourceVisibility;

        const templateId = crypto.randomUUID();
        const slug = await generateUniqueSlug(env, template.title || '', templateId);

        try {
          await db.insert(templates).values({
            id: templateId,
            user_id: userId,
            title: template.title || '',
            description: template.description || '',
            type: finalType,
            seo_title: template.seoTitle || '',
            seo_description: template.seoDescription || '',
            rules: Array.isArray(template.rules) && template.rules.length > 0 ? JSON.stringify(template.rules) : null,
            items: JSON.stringify(normalizedSections.sections),
            version: 1,
            is_public: isPublic,
            category: JSON.stringify(finalCategories),
            tags: JSON.stringify(finalTags),
            slug,
            created_at: new Date().toISOString(),
          });
          summary.imported += 1;
          summary.successes.push({
            index,
            title: template.title,
            id: templateId,
            slug,
            visibility: isPublic ? 'public' : 'private',
          });
        } catch (err) {
          summary.failed.push({
            index,
            title: template.title,
            reason: err instanceof Error ? err.message : 'Unknown error',
            code: 'insert_failed',
          });
        }
      }

      if (summary.imported === 0 && summary.failed.length > 0) {
        return jsonError('Template import failed', 400, {
          code: 'template_import_failed',
          details: summary,
        });
      }

      return json(summary);
    }

    return new Response('Method Not Allowed', { status: 405 });
  }

  if (request.method === 'GET') {
    // GET /api/templates/public?userId=...
    if (templatesSubpath[0] === 'public') {
      const targetUserId = url.searchParams.get('userId');
      if (!targetUserId) {
        return jsonError('userId required', 400);
      }

      const rows = await selectTemplatesWithOwner(env)
        .where(and(eq(templates.is_public, true), eq(templates.user_id, targetUserId)))
        .orderBy(desc(templates.created_at));

      return json(rows.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>)));
    }

    // GET /api/templates/slug/:slug
    if (templatesSubpath[0] === 'slug' && templatesSubpath[1]) {
      const slug = templatesSubpath.slice(1).join('/');
      const whereClause = userId
        ? and(eq(templates.slug, slug), or(eq(templates.is_public, true), eq(templates.user_id, userId)))
        : and(eq(templates.slug, slug), eq(templates.is_public, true));

      const [template] = await selectTemplatesWithOwner(env)
        .where(whereClause)
        .limit(1);

      if (!template) {
        return jsonError('Template not found', 404);
      }

      return json(parseTemplateRow(template as unknown as Record<string, unknown>));
    }

    // GET /api/templates/:id
    if (templatesSubpath[0]) {
      const templateId = templatesSubpath[0];
      const whereClause = userId
        ? and(eq(templates.id, templateId), or(eq(templates.is_public, true), eq(templates.user_id, userId)))
        : and(eq(templates.id, templateId), eq(templates.is_public, true));

      const [template] = await selectTemplatesWithOwner(env)
        .where(whereClause)
        .limit(1);

      if (!template) {
        return jsonError('Template not found', 404);
      }

      return json(parseTemplateRow(template as unknown as Record<string, unknown>));
    }

    // GET /api/templates (list)
    const whereClause = userId
      ? or(eq(templates.is_public, true), eq(templates.user_id, userId))
      : eq(templates.is_public, true);

    const rows = await selectTemplatesWithOwner(env)
      .where(whereClause)
      .orderBy(desc(templates.created_at));

    return json(rows.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>)));
  }

  if (request.method === 'POST') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    // POST /api/templates/:id/clone (Pro only)
    if (templatesSubpath[0] && templatesSubpath[1] === 'clone') {
      const sourceId = templatesSubpath[0];

      const entitlements = await getEntitlementsForUser(env, userId);
      if (entitlements.limits.maxTemplates !== null) {
        const [existingCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(templates)
          .where(eq(templates.user_id, userId))
          .limit(1);

        const currentCount = existingCount?.count ?? 0;
        if (currentCount >= entitlements.limits.maxTemplates) {
          return jsonError("Template limit reached. Upgrade to Pro to save more templates.", 403, {
            code: 'limit_reached',
            details: { limit: entitlements.limits.maxTemplates, current: currentCount, resource: 'templates' },
          });
        }
      }

      const [source] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, sourceId))
        .limit(1);

      if (!source || !source.is_public) {
        return jsonError('Template not found', 404);
      }

      let visibility: 'preserve' | 'public' | 'private' = 'private';
      try {
        const raw = await request.json();
        if (isRecord(raw) && (raw.visibility === 'preserve' || raw.visibility === 'public' || raw.visibility === 'private')) {
          visibility = raw.visibility;
        }
      } catch {
        // allow empty body
      }

      const isPublic = visibility === 'public' ? true : visibility === 'preserve' ? true : false;

      const templateId = crypto.randomUUID();
      const slug = await generateUniqueSlug(env, source.title || '', templateId);

      await db.insert(templates).values({
        id: templateId,
        user_id: userId,
        title: source.title || '',
        description: source.description || '',
        type: typeof (source as Record<string, unknown>).type === 'string' ? (source as Record<string, unknown>).type : 'checklist',
        seo_title: typeof (source as Record<string, unknown>).seo_title === 'string' ? (source as Record<string, unknown>).seo_title : '',
        seo_description: typeof (source as Record<string, unknown>).seo_description === 'string' ? (source as Record<string, unknown>).seo_description : '',
        rules: typeof (source as Record<string, unknown>).rules === 'string' ? (source as Record<string, unknown>).rules : null,
        items: source.items,
        version: typeof (source as Record<string, unknown>).version === 'number' ? (source as Record<string, unknown>).version : 1,
        is_public: isPublic,
        category: source.category,
        tags: source.tags,
        slug,
        created_at: new Date().toISOString(),
      });

      return json({ id: templateId, slug });
    }

    const entitlements = await getEntitlementsForUser(env, userId);
    if (entitlements.plan === 'free' && entitlements.limits.maxTemplates) {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(templates)
        .where(eq(templates.user_id, userId))
        .limit(1);

      const currentCount = row?.count ?? 0;
      if (currentCount >= entitlements.limits.maxTemplates) {
        return jsonError('Template limit reached. Upgrade to Pro to create more templates.', 403, {
          code: 'limit_reached',
          details: { limit: entitlements.limits.maxTemplates, current: currentCount, resource: 'templates' },
        });
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON payload', 400);
    }

    const parsed = templatePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid template payload', 400);
    }

    const { title, description, type, seoTitle, seoDescription, rules, is_public, categories, category, tags, slug: requestedSlug, sections, items: bodyItems } = parsed.data;

    const normalizedSections = normalizeSectionsPayload(sections ?? bodyItems);
    if (normalizedSections.error) {
      return jsonError(normalizedSections.error, 400);
    }

    const templateId = crypto.randomUUID();
    const slugSource = typeof requestedSlug === 'string' && requestedSlug.trim() ? requestedSlug.trim() : title || '';
    const slug = await generateUniqueSlug(env, slugSource, templateId);

    const finalCategories = normalizeStringArray(categories ?? category);
    const finalTags = normalizeStringArray(tags);
    const finalType = type ?? 'checklist';
    const isPublic = typeof is_public === 'boolean' ? is_public : false;

    if (title && junkTemplateTitles.has(title)) {
      console.warn('Junk template title created', { userId, title });
    }

    await db.insert(templates).values({
      id: templateId,
      user_id: userId,
      title: title || '',
      description: description || '',
      type: finalType,
      seo_title: seoTitle || '',
      seo_description: seoDescription || '',
      rules: Array.isArray(rules) && rules.length > 0 ? JSON.stringify(rules) : null,
      items: JSON.stringify(normalizedSections.sections),
      version: 1,
      is_public: isPublic,
      category: JSON.stringify(finalCategories),
      tags: JSON.stringify(finalTags),
      slug,
      created_at: new Date().toISOString(),
    });

    return json({ id: templateId, slug });
  }

  if (request.method === 'PUT') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const templateId = url.pathname.split('/').pop();

    if (!templateId || templateId === 'templates') {
      return jsonError('Template ID required', 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON payload', 400);
    }

    const parsed = templatePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid template payload', 400);
    }

    const { title, description, type, seoTitle, seoDescription, rules, is_public, categories, category, tags, slug: requestedSlug, sections, items: bodyItems } = parsed.data;
    const rawBody = body as Record<string, unknown>;

    // Only update slug if explicitly provided (avoid breaking shared URLs on title edits).
    let nextSlug: string | null = null;
    if (typeof requestedSlug === 'string' && requestedSlug.trim()) {
      nextSlug = generateSlug(requestedSlug.trim());
      const [conflict] = await db
        .select({ id: templates.id })
        .from(templates)
        .where(and(eq(templates.slug, nextSlug), ne(templates.id, templateId)))
        .limit(1);

      if (conflict) {
        nextSlug = `${nextSlug}-${templateId.slice(0, 8)}`;
      }
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    let syncedItems: string | null = null;

    if (typeof title !== 'undefined') {
      updates.title = title || '';
    }
    if (typeof description !== 'undefined') {
      updates.description = description || '';
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, 'type') && typeof type === 'string') {
      updates.type = type;
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, 'seoTitle')) {
      updates.seo_title = seoTitle || '';
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, 'seoDescription')) {
      updates.seo_description = seoDescription || '';
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, 'rules')) {
      updates.rules = Array.isArray(rules) && rules.length > 0 ? JSON.stringify(rules) : null;
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, 'sections') || Object.prototype.hasOwnProperty.call(rawBody, 'items')) {
      const normalizedSections = normalizeSectionsPayload(sections ?? bodyItems);
      if (normalizedSections.error) {
        return jsonError(normalizedSections.error, 400);
      }
      const nextItems = JSON.stringify(normalizedSections.sections);
      updates.items = nextItems;
      syncedItems = nextItems;
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, 'is_public') && typeof is_public === 'boolean') {
      updates.is_public = is_public;
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, 'categories') || Object.prototype.hasOwnProperty.call(rawBody, 'category')) {
      const finalCategories = normalizeStringArray(categories ?? category);
      updates.category = JSON.stringify(finalCategories);
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, 'tags')) {
      const finalTags = normalizeStringArray(tags);
      updates.tags = JSON.stringify(finalTags);
    }

    if (nextSlug) {
      updates.slug = nextSlug;
    }

    if (typeof title === 'string' && junkTemplateTitles.has(title)) {
      console.warn('Junk template title updated', { userId, templateId, title });
    }

    await db.update(templates)
      .set(updates)
      .where(and(eq(templates.id, templateId), eq(templates.user_id, userId)));

    if (syncedItems !== null) {
      await db.update(checklist_runs)
        .set({ items: syncedItems, updated_at: new Date().toISOString() })
        .where(and(eq(checklist_runs.template_id, templateId), eq(checklist_runs.user_id, userId)));
    }

    return json({ success: true, slug: typeof updates.slug === 'string' ? updates.slug : undefined });
  }

  if (request.method === 'DELETE') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const templateId = url.pathname.split('/').pop();

    if (!templateId || templateId === 'templates') {
      return jsonError('Template ID required', 400);
    }

    // First check if the template exists and belongs to the user
    const [existingTemplate] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.id, templateId), eq(templates.user_id, userId)))
      .limit(1);

    if (!existingTemplate) {
      return jsonError('Template not found or unauthorized', 404);
    }

    // Now delete the template
    await db.delete(templates)
      .where(and(eq(templates.id, templateId), eq(templates.user_id, userId)));

    return json({ success: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
