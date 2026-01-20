import { Env } from '../types';
import { verifyJWT } from '../utils/jwt';
import { generateSlug } from '../utils/slug';
import { and, desc, eq, ne, or } from 'drizzle-orm';
import { createDb, schema } from '../db';

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
  if (template.items) {
    const parsedItems = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;
    // Check if items is already in sections format (has id, title, items properties)
    if (Array.isArray(parsedItems) && parsedItems.length > 0 && typeof (parsedItems[0] as Record<string, unknown>)?.items !== 'undefined') {
      sections = parsedItems;
    } else {
      // Legacy format - wrap in a single section
      sections = [{
        id: '1',
        title: 'Checklist',
        items: parsedItems
      }];
    }
  }

  // Parse categories - handle both single string and JSON array
  let categories: unknown[] = [];
  if (template.category) {
    try {
      categories = JSON.parse(String(template.category));
    } catch {
      categories = [template.category];
    }
  }

  return {
    ...template,
    sections,
    categories,
    tags: typeof template.tags === 'string' ? JSON.parse(template.tags || '[]') : (template.tags || [])
  };
}

export async function handleTemplates(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const userId = authHeader ? await verifyJWT(authHeader.replace('Bearer ', ''), env.JWT_SECRET) : null;
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
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const rows = await db
        .select()
        .from(templates)
        .where(and(eq(templates.is_public, true), eq(templates.user_id, targetUserId)))
        .orderBy(desc(templates.created_at));

      return new Response(JSON.stringify(rows.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>))), {
        headers: { 'Content-Type': 'application/json' }
      });
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
        return new Response(JSON.stringify({ error: 'Template not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(parseTemplateRow(template as unknown as Record<string, unknown>)), {
        headers: { 'Content-Type': 'application/json' }
      });
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
        return new Response(JSON.stringify({ error: 'Template not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(parseTemplateRow(template as unknown as Record<string, unknown>)), {
        headers: { 'Content-Type': 'application/json' }
      });
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

    return new Response(JSON.stringify(rows.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>))), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'POST') {
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { title, description, is_public, categories, category, tags, sections, items: bodyItems } = body;

    // Handle both items and sections format
    let items = bodyItems;
    if (!items && sections) {
      // Store the full sections structure as items to preserve all content
      items = sections;
    }

    const templateId = crypto.randomUUID();
    const slug = await generateUniqueSlug(env, title || '', templateId);

    const finalCategories = Array.isArray(categories)
      ? categories
      : (typeof category === 'string' && category ? [category] : []);

    await db.insert(templates).values({
      id: templateId,
      user_id: userId,
      title: title || '',
      description: description || '',
      items: JSON.stringify(sections || items || []),
      is_public: Boolean(is_public),
      category: JSON.stringify(finalCategories || []),
      tags: JSON.stringify(tags || []),
      slug,
      created_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ id: templateId, slug }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'PUT') {
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const templateId = url.pathname.split('/').pop();

    if (!templateId || templateId === 'templates') {
      return new Response(JSON.stringify({ error: 'Template ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { title, description, is_public, categories, category, tags, slug: requestedSlug } = body;

    // Handle both items and sections format
    let items = body.items;
    if (!items && body.sections) {
      // Store the full sections structure as items to preserve all content
      items = body.sections;
    }

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

    const finalCategories = Array.isArray(categories)
      ? categories
      : (typeof category === 'string' && category ? [category] : []);

    const updates: Record<string, unknown> = {
      title: title || '',
      description: description || '',
      items: JSON.stringify(items || []),
      is_public: Boolean(is_public),
      category: JSON.stringify(finalCategories || []),
      tags: JSON.stringify(tags || []),
      updated_at: new Date().toISOString(),
    };

    if (nextSlug) {
      updates.slug = nextSlug;
    }

    await db.update(templates)
      .set(updates)
      .where(and(eq(templates.id, templateId), eq(templates.user_id, userId)));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'DELETE') {
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const templateId = url.pathname.split('/').pop();

    if (!templateId || templateId === 'templates') {
      return new Response(JSON.stringify({ error: 'Template ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // First check if the template exists and belongs to the user
    const [existingTemplate] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.id, templateId), eq(templates.user_id, userId)))
      .limit(1);

    if (!existingTemplate) {
      return new Response(JSON.stringify({ error: 'Template not found or unauthorized' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Now delete the template
    await db.delete(templates)
      .where(and(eq(templates.id, templateId), eq(templates.user_id, userId)));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
