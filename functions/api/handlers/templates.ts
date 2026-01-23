import { Env } from '../types';
import { generateSlug } from '../utils/slug';
import { and, desc, eq, ne, or } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { normalizeSectionsPayload, normalizeStringArray, templatePayloadSchema } from '../utils/payloads';
import { json, jsonError } from '../utils/response';
import { getSessionUserId } from '../utils/session';

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

  return {
    ...template,
    sections,
    categories: normalizeStringArray(template.category),
    tags: normalizeStringArray(template.tags)
  };
}

export async function handleTemplates(request: Request, env: Env): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "templates", ...]
  const templatesSubpath = pathParts.slice(2); // after /api/templates
  const db = createDb(env);
  const { templates } = schema;

  if (request.method === 'GET') {
    // GET /api/templates/public?userId=...
    if (templatesSubpath[0] === 'public') {
      const targetUserId = url.searchParams.get('userId');
      if (!targetUserId) {
        return jsonError('userId required', 400);
      }

      const rows = await db
        .select()
        .from(templates)
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

      const [template] = await db
        .select()
        .from(templates)
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

      const [template] = await db
        .select()
        .from(templates)
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

    const rows = await db
      .select()
      .from(templates)
      .where(whereClause)
      .orderBy(desc(templates.created_at));

    return json(rows.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>)));
  }

  if (request.method === 'POST') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
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

    const { title, description, is_public, categories, category, tags, sections, items: bodyItems } = parsed.data;

    const normalizedSections = normalizeSectionsPayload(sections ?? bodyItems);
    if (normalizedSections.error) {
      return jsonError(normalizedSections.error, 400);
    }

    const templateId = crypto.randomUUID();
    const slug = await generateUniqueSlug(env, title || '', templateId);

    const finalCategories = normalizeStringArray(categories ?? category);
    const finalTags = normalizeStringArray(tags);
    const isPublic = typeof is_public === 'boolean' ? is_public : false;

    await db.insert(templates).values({
      id: templateId,
      user_id: userId,
      title: title || '',
      description: description || '',
      items: JSON.stringify(normalizedSections.sections),
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

    const { title, description, is_public, categories, category, tags, slug: requestedSlug, sections, items: bodyItems } = parsed.data;
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

    if (typeof title !== 'undefined') {
      updates.title = title || '';
    }
    if (typeof description !== 'undefined') {
      updates.description = description || '';
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, 'sections') || Object.prototype.hasOwnProperty.call(rawBody, 'items')) {
      const normalizedSections = normalizeSectionsPayload(sections ?? bodyItems);
      if (normalizedSections.error) {
        return jsonError(normalizedSections.error, 400);
      }
      updates.items = JSON.stringify(normalizedSections.sections);
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

    await db.update(templates)
      .set(updates)
      .where(and(eq(templates.id, templateId), eq(templates.user_id, userId)));

    return json({ success: true });
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
