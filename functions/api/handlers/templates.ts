import { Env } from '../types';
import { generateSlug, truncateSlug, withSlugSuffix } from '../utils/slug';
import { and, desc, eq, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { createDb, schema } from '../db';
import {
  formatPayloadIssue,
  normalizeSectionsPayload,
  normalizeStringArray,
  parseJsonArray,
  templateImportFieldsSchema,
  templatePayloadSchema,
  templateUpdatePayloadSchema,
} from '../utils/payloads';
import { TEMPLATE_SLUG_MAX } from '../../../src/lib/schemas/templateLimits';
import { json, jsonError } from '../utils/response';
import { withEdgeCache } from '../utils/edge-cache';
import { log } from '../utils/logger';
import { getSessionUserId } from '../utils/session';
import { getEntitlementsForContext, getEntitlementsForUser } from '../utils/entitlements';
import {
  buildAuditEventValues,
  buildTemplateVersionValues,
  type AuditSubject,
} from '../utils/audit';
import {
  parseHistoryLimit,
  selectAuditEventHistory,
  selectTemplateVersionHistory,
  serializeHistoryEvent,
} from '../utils/history-queries';
import { canEditTeamTemplates, canViewTeam, getActiveTeamMembership, normalizeTeamRole } from '../utils/team-access';
import { z } from 'zod';
import { portableTemplateRuleSchema } from '../../../src/lib/schemas/checklistSchema';
import { buildPortableTemplatePack, parsePortableTemplatePackImport } from '../utils/template-portable';
import {
  assignMissingStableTemplateIdentities,
  calculateRunProgress,
  reconcileRunSections,
  validateStableTemplateIdentities,
} from '../utils/template-reconciliation';
import {
  isVersionedTemplateChange,
  omitUnchangedTemplateColumns,
  templateStructureChanged,
  validateChangedTemplateFields,
} from '../utils/template-changes';

const junkTemplateTitles = new Set(['Test Template', 'Updated Template Title']);

type QueryResult<T> = PromiseLike<T> | T;
type TemplateInsertValues = typeof schema.templates.$inferInsert;
type TemplateUpdateValues = Partial<TemplateInsertValues>;
type AuditEventValues = typeof schema.audit_events.$inferInsert;
type TemplateVersionValues = typeof schema.template_versions.$inferInsert;

function isMissingRulesColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /templates[".]?\.?"?rules|no such column:.*rules/i.test(message);
}

function getTemplateSelectColumns(includeRules: boolean) {
  const { templates } = schema;

  return {
    id: templates.id,
    user_id: templates.user_id,
    title: templates.title,
    description: templates.description,
    items: templates.items,
    version: templates.version,
    content_version: templates.content_version,
    type: templates.type,
    seo_title: templates.seo_title,
    seo_description: templates.seo_description,
    ...(includeRules ? { rules: templates.rules } : {}),
    owner_type: templates.owner_type,
    team_id: templates.team_id,
    created_by_user_id: templates.created_by_user_id,
    updated_by_user_id: templates.updated_by_user_id,
    is_public: templates.is_public,
    category: templates.category,
    tags: templates.tags,
    slug: templates.slug,
    created_at: templates.created_at,
    updated_at: templates.updated_at,
    deleted_at: templates.deleted_at,
  };
}

async function withRulesColumnFallback<T>(
  operation: (includeRules: boolean) => QueryResult<T>,
): Promise<T> {
  try {
    return await operation(true);
  } catch (error) {
    if (!isMissingRulesColumnError(error)) {
      throw error;
    }

    return operation(false);
  }
}

function omitRulesColumn<T extends Record<string, unknown>>(values: T): Omit<T, 'rules'> {
  const { rules: _rules, ...rest } = values;
  return rest;
}

async function insertTemplateWithHistoryFallback(
  db: ReturnType<typeof createDb>,
  values: TemplateInsertValues,
  versionValues: TemplateVersionValues,
  auditEventValues: AuditEventValues,
): Promise<void> {
  const { audit_events, template_versions, templates } = schema;

  const runBatch = (templateValues: TemplateInsertValues) =>
    db.batch([
      db.insert(templates).values(templateValues),
      db.insert(template_versions).values(versionValues),
      db.insert(audit_events).values(auditEventValues),
    ]);

  try {
    await runBatch(values);
  } catch (error) {
    if (!isMissingRulesColumnError(error)) {
      throw error;
    }

    await runBatch(omitRulesColumn(values as Record<string, unknown>) as TemplateInsertValues);
  }
}

async function updateTemplateWithHistoryFallback(
  db: ReturnType<typeof createDb>,
  values: TemplateUpdateValues,
  whereClause: SQL | undefined,
  auditEventValues: AuditEventValues,
  versionValues?: TemplateVersionValues,
  reconciledRunUpdates: Array<{
    items: string;
    retiredItems: string;
    progress: number;
    templateVersion: number;
    revision: number;
    whereClause: SQL | undefined;
    updatedAt: string;
  }> = [],
): Promise<readonly unknown[]> {
  const { audit_events, checklist_runs, template_versions, templates } = schema;

  const runBatch = (templateValues: TemplateUpdateValues) => {
    const statements = [
      db.update(templates).set(templateValues).where(whereClause),
      ...(versionValues ? [db.insert(template_versions).values(versionValues)] : []),
      db.insert(audit_events).values(auditEventValues),
      ...reconciledRunUpdates.map((runUpdate) =>
        db
          .update(checklist_runs)
          .set({
            items: runUpdate.items,
            retired_items: runUpdate.retiredItems,
            progress: runUpdate.progress,
            template_version: runUpdate.templateVersion,
            revision: runUpdate.revision + 1,
            updated_at: runUpdate.updatedAt,
          })
          .where(runUpdate.whereClause),
      ),
    ] as const;

    return db.batch(statements);
  };

  try {
    return await runBatch(values);
  } catch (error) {
    if (!isMissingRulesColumnError(error)) {
      throw error;
    }

    return await runBatch(omitRulesColumn(values as Record<string, unknown>) as TemplateUpdateValues);
  }
}

function batchUpdateMissed(result: unknown): boolean {
  if (!isRecord(result)) return false;
  const meta = result.meta;
  return isRecord(meta) && typeof meta.changes === 'number' && meta.changes === 0;
}

async function generateUniqueSlug(env: Env, title: string, templateId: string): Promise<string> {
  const base = truncateSlug(generateSlug(title || 'template'), TEMPLATE_SLUG_MAX) || 'template';
  const db = createDb(env);
  const { templates } = schema;

  // Prefer the clean slug if available; otherwise fall back to a deterministic suffix.
  const [exists] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.slug, base))
    .limit(1);

  if (!exists) return base;

  const suffixed = withSlugSuffix(base, templateId.slice(0, 8), TEMPLATE_SLUG_MAX);
  const [existsSuffixed] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.slug, suffixed))
    .limit(1);

  if (!existsSuffixed) return suffixed;

  // Extremely unlikely collision; use random suffix.
  return withSlugSuffix(base, crypto.randomUUID().slice(0, 8), TEMPLATE_SLUG_MAX);
}

function parseTemplateRow<T extends Record<string, unknown>>(template: T) {
  let sections: unknown[] = [];
  if (typeof template.items !== 'undefined') {
    const normalized = normalizeSectionsPayload(template.items);
    if (normalized.error) {
      log('warn', 'template_items_parse_failed', { templateId: template.id });
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
      log('warn', 'template_rules_parse_failed', { templateId: template.id });
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

function selectTemplatesWithOwner(env: Env, includeRules = true) {
  const db = createDb(env);
  const { templates, users } = schema;

  return db
    .select({
      ...getTemplateSelectColumns(includeRules),
      owner_username: users.username,
      owner_full_name: users.name,
    })
    .from(templates)
    .leftJoin(users, eq(users.id, templates.user_id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMissingHistoryReadTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table: (audit_events|template_versions)/i.test(message);
}

function getTemplateSubject(template: Record<string, unknown>, fallbackUserId: string): AuditSubject {
  if (template.owner_type === 'team' && typeof template.team_id === 'string' && template.team_id) {
    return { type: 'team', id: template.team_id };
  }

  return {
    type: 'user',
    id: typeof template.user_id === 'string' && template.user_id ? template.user_id : fallbackUserId,
  };
}

function getRequestedTeamId(parsed: { teamId?: string; team_id?: string }, url: URL): string | null {
  return parsed.teamId ?? parsed.team_id ?? url.searchParams.get('teamId');
}

async function canViewTemplate(env: Env, template: Record<string, unknown>, userId: string | null): Promise<boolean> {
  if (typeof template.deleted_at === 'string' && template.deleted_at) return false;
  if (template.is_public === true || template.is_public === 1) return true;
  if (!userId) return false;
  if (template.owner_type === 'team' && typeof template.team_id === 'string' && template.team_id) {
    const membership = await getActiveTeamMembership(env, template.team_id, userId);
    return membership ? canViewTeam(normalizeTeamRole(membership.role)) : false;
  }

  return template.user_id === userId;
}

async function canViewTemplateHistory(env: Env, template: Record<string, unknown>, userId: string): Promise<boolean> {
  if (template.owner_type === 'team' && typeof template.team_id === 'string' && template.team_id) {
    const membership = await getActiveTeamMembership(env, template.team_id, userId);
    return membership ? canViewTeam(normalizeTeamRole(membership.role)) : false;
  }

  return template.user_id === userId;
}

async function canEditTemplate(env: Env, template: Record<string, unknown>, userId: string): Promise<boolean> {
  if (template.owner_type === 'team' && typeof template.team_id === 'string' && template.team_id) {
    const membership = await getActiveTeamMembership(env, template.team_id, userId);
    return membership ? canEditTeamTemplates(normalizeTeamRole(membership.role)) : false;
  }

  return template.user_id === userId;
}

async function assertTeamTemplateCreateAccess(env: Env, teamId: string, userId: string): Promise<Response | null> {
  const membership = await getActiveTeamMembership(env, teamId, userId);
  if (!membership) return jsonError('Organization not found', 404);
  if (!canEditTeamTemplates(normalizeTeamRole(membership.role))) return jsonError('Forbidden', 403);
  return null;
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

type TemplateImportFailureCode = 'invalid_fields' | 'invalid_sections' | 'oversized_asset' | 'insert_failed';

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

export async function handleTemplates(request: Request, env: Env): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "templates", ...]
  const templatesSubpath = pathParts.slice(2); // after /api/templates
  const db = createDb(env);
  const { templates, users, checklist_runs, audit_events } = schema;

  // Pro-only: export/import templates as JSON backup
  // GET  /api/templates/backup?includePublic=1&teamId=...
  // POST /api/templates/backup?teamId=...  { templates: [...], options?: { visibility } }
  if (templatesSubpath[0] === 'backup') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const backupTeamId = url.searchParams.get('teamId')?.trim() || null;
    if (backupTeamId) {
      const accessError = await assertTeamTemplateCreateAccess(env, backupTeamId, userId);
      if (accessError) return accessError;
    }

    const entitlements = backupTeamId
      ? await getEntitlementsForContext(env, { type: 'team', teamId: backupTeamId, userId })
      : await getEntitlementsForUser(env, userId);
    if (entitlements.plan !== 'pro' && entitlements.plan !== 'team') {
      return jsonError('Upgrade this Organization to use template import/export.', 403, { code: 'upgrade_required' });
    }

    if (request.method === 'GET') {
      const exportFormat = url.searchParams.get('format') === 'backup' ? 'backup' : 'portable';
      const includePublic = url.searchParams.get('includePublic') === '1';
      const ownedTemplateClause = backupTeamId
        ? and(eq(templates.owner_type, 'team'), eq(templates.team_id, backupTeamId), isNull(templates.deleted_at))
        : and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNull(templates.deleted_at));
      const whereClause = includePublic
        ? or(ownedTemplateClause, and(eq(templates.is_public, true), isNull(templates.deleted_at)))
        : ownedTemplateClause;

      const rows = await withRulesColumnFallback((includeRules) =>
        db
          .select(getTemplateSelectColumns(includeRules))
          .from(templates)
          .where(whereClause)
          .orderBy(desc(templates.created_at)),
      );

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
        return json(buildPortableTemplatePack(exportedTemplates, userRow?.email));
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

      // Portable templates that fail validation stay in the summary under their file index.
      let sourceIndexes: number[] | null = null;
      let portableFailures: TemplateImportFailure[] = [];
      if (isRecord(body) && body.kind === 'serplists-template-pack') {
        const portable = parsePortableTemplatePackImport(body);
        if ('response' in portable) return portable.response;
        body = { templates: portable.templates };
        sourceIndexes = portable.sourceIndexes;
        portableFailures = portable.failures;
      }

      const parsedBody = Array.isArray(body)
        ? templateBackupImportBodySchema.safeParse({ templates: body })
        : templateBackupImportBodySchema.safeParse(body);

      if (!parsedBody.success) {
        return jsonError(parsedBody.error.issues[0]?.message || 'Invalid template import payload', 400);
      }

      const { templates: incomingTemplates, options } = parsedBody.data;
      const fileTemplateCount = incomingTemplates.length + portableFailures.length;

      if (fileTemplateCount > MAX_TEMPLATES_PER_IMPORT) {
        return jsonError(`Import limited to ${MAX_TEMPLATES_PER_IMPORT} templates per file for now`, 400, {
          code: 'import_limit',
          details: { limit: MAX_TEMPLATES_PER_IMPORT, current: fileTemplateCount },
        });
      }

      const visibility = options?.visibility ?? 'preserve';

      const summary: TemplateImportSummary = {
        total: fileTemplateCount,
        imported: 0,
        failed: [...portableFailures],
        successes: [],
      };

      for (const [position, template] of incomingTemplates.entries()) {
        const index = sourceIndexes?.[position] ?? position;
        const finalCategories = normalizeStringArray(template.categories ?? template.category);
        const finalTags = normalizeStringArray(template.tags);
        const fields = templateImportFieldsSchema.safeParse({ ...template, categories: finalCategories, tags: finalTags });
        if (!fields.success) {
          summary.failed.push({
            index,
            title: template.title,
            reason: formatPayloadIssue(fields.error, 'Invalid template fields'),
            code: 'invalid_fields',
          });
          continue;
        }
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
        normalizedSections.sections = assignMissingStableTemplateIdentities(normalizedSections.sections);
        const identityError = validateStableTemplateIdentities(normalizedSections.sections);
        if (identityError) {
          summary.failed.push({
            index,
            title: template.title,
            reason: identityError,
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
        const slug = await generateUniqueSlug(env, fields.data.title, templateId);

        try {
          const now = new Date().toISOString();
          const insertedTemplate: TemplateInsertValues = {
            id: templateId,
            user_id: userId,
            title: fields.data.title,
            description: fields.data.description || '',
            type: finalType,
            seo_title: fields.data.seoTitle || '',
            seo_description: fields.data.seoDescription || '',
            rules: fields.data.rules && fields.data.rules.length > 0 ? JSON.stringify(fields.data.rules) : null,
            items: JSON.stringify(normalizedSections.sections),
            version: 1,
            is_public: isPublic,
            category: JSON.stringify(finalCategories),
            tags: JSON.stringify(finalTags),
            slug,
            owner_type: backupTeamId ? 'team' : 'user',
            team_id: backupTeamId,
            created_by_user_id: userId,
            created_at: now,
          };
          const subject: AuditSubject = backupTeamId ? { type: 'team', id: backupTeamId } : { type: 'user', id: userId };

          const versionValues = await buildTemplateVersionValues({
            templateId,
            version: 1,
            changedByUserId: userId,
            subject,
            snapshot: insertedTemplate as Record<string, unknown>,
            changeSummary: 'template.imported',
            createdAt: now,
          });
          const auditEvent = await buildAuditEventValues({
            actorUserId: userId,
            subject,
            resource: { type: 'template', id: templateId },
            action: 'template.imported',
            after: insertedTemplate as Record<string, unknown>,
            metadata: { source: 'backup_import', importIndex: index, teamId: backupTeamId },
            request,
            createdAt: now,
          });
          await insertTemplateWithHistoryFallback(db, insertedTemplate, versionValues, auditEvent);
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

      summary.failed.sort((a, b) => a.index - b.index);
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

      const rows = await withRulesColumnFallback((includeRules) =>
        selectTemplatesWithOwner(env, includeRules)
          .where(
            and(
              eq(templates.owner_type, 'user'),
              eq(templates.user_id, targetUserId),
              isNull(templates.team_id),
              // Unary + stops SQLite using an index for this term, which keeps the planner on
              // idx_templates_owner instead of scanning every public Template (see the D1 cost doc).
              sql`+${templates.is_public} = 1`,
              isNull(templates.deleted_at),
            ),
          )
          .orderBy(desc(templates.created_at)),
      );

      return json(rows.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>)));
    }

    // GET /api/templates/slug/:slug
    if (templatesSubpath[0] === 'slug' && templatesSubpath[1]) {
      const slug = templatesSubpath.slice(1).join('/');
      const [template] = await withRulesColumnFallback((includeRules) =>
        selectTemplatesWithOwner(env, includeRules)
          .where(and(eq(templates.slug, slug), isNull(templates.deleted_at)))
          .limit(1),
      );

      if (!template || !(await canViewTemplate(env, template as unknown as Record<string, unknown>, userId))) {
        return jsonError('Template not found', 404);
      }

      return json(parseTemplateRow(template as unknown as Record<string, unknown>));
    }

    // GET /api/templates/archived?teamId=...
    if (templatesSubpath[0] === 'archived') {
      if (!userId) {
        return jsonError('Unauthorized', 401);
      }

      const teamId = url.searchParams.get('teamId');
      if (teamId) {
        const membership = await getActiveTeamMembership(env, teamId, userId);
        if (!membership || !canViewTeam(normalizeTeamRole(membership.role))) {
          return jsonError('Organization not found', 404);
        }

        const rows = await withRulesColumnFallback((includeRules) =>
          selectTemplatesWithOwner(env, includeRules)
            .where(and(eq(templates.owner_type, 'team'), eq(templates.team_id, teamId), isNotNull(templates.deleted_at)))
            .orderBy(desc(templates.updated_at)),
        );

        return json(rows.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>)));
      }

      const rows = await withRulesColumnFallback((includeRules) =>
        selectTemplatesWithOwner(env, includeRules)
          .where(and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNotNull(templates.deleted_at)))
          .orderBy(desc(templates.updated_at)),
      );

      return json(rows.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>)));
    }

    // GET /api/templates/:id/history
    if (templatesSubpath[0] && templatesSubpath[1] === 'history') {
      if (!userId) {
        return jsonError('Unauthorized', 401);
      }

      const templateId = templatesSubpath[0];
      const historyLimit = parseHistoryLimit(url.searchParams.get('limit'));
      const [template] = await withRulesColumnFallback((includeRules) =>
        db
          .select(getTemplateSelectColumns(includeRules))
          .from(templates)
          .where(eq(templates.id, templateId))
          .limit(1),
      );

      if (!template || !(await canViewTemplateHistory(env, template as unknown as Record<string, unknown>, userId))) {
        return jsonError('Template not found', 404);
      }

      try {
        const versionRows = await selectTemplateVersionHistory(db, templateId, historyLimit);
        // Audit events are only a fallback for templates created before versioning.
        const eventRows = versionRows.length > 0
          ? []
          : await selectAuditEventHistory(db, 'template', templateId, historyLimit);

        return json({
          templateId,
          subject: getTemplateSubject(template as unknown as Record<string, unknown>, userId),
          versions: versionRows.map((row) => ({
            id: row.id,
            version: row.version,
            action: row.change_summary ?? 'template.versioned',
            contentHash: row.content_hash,
            createdAt: row.created_at,
            actor: {
              userId: row.changed_by_user_id,
              email: row.actor_email,
              name: row.actor_name,
              username: row.actor_username,
            },
          })),
          events: eventRows.map(serializeHistoryEvent),
        });
      } catch (error) {
        if (isMissingHistoryReadTableError(error)) {
          return json({
            templateId,
            subject: getTemplateSubject(template as unknown as Record<string, unknown>, userId),
            versions: [],
            events: [],
          });
        }

        throw error;
      }
    }

    // GET /api/templates/:id
    if (templatesSubpath[0]) {
      const templateId = templatesSubpath[0];
      const [template] = await withRulesColumnFallback((includeRules) =>
        selectTemplatesWithOwner(env, includeRules)
          .where(and(eq(templates.id, templateId), isNull(templates.deleted_at)))
          .limit(1),
      );

      if (!template || !(await canViewTemplate(env, template as unknown as Record<string, unknown>, userId))) {
        return jsonError('Template not found', 404);
      }

      return json(parseTemplateRow(template as unknown as Record<string, unknown>));
    }

    // GET /api/templates (list)
    const teamId = url.searchParams.get('teamId');
    if (teamId) {
      if (!userId) return jsonError('Unauthorized', 401);
      const membership = await getActiveTeamMembership(env, teamId, userId);
      if (!membership || !canViewTeam(normalizeTeamRole(membership.role))) {
        return jsonError('Organization not found', 404);
      }

      const rows = await withRulesColumnFallback((includeRules) =>
        selectTemplatesWithOwner(env, includeRules)
          .where(and(eq(templates.owner_type, 'team'), eq(templates.team_id, teamId), isNull(templates.deleted_at)))
          .orderBy(desc(templates.created_at)),
      );

      return json(rows.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>)));
    }

    // ?scope=public is the catalog, identical for everyone. ?scope=personal is the user's
    // own Personal templates (idx_templates_owner). No scope returns public OR mine for
    // clients loaded before scopes existed (see the D1 cost plan).
    const scope = url.searchParams.get('scope');
    if (scope === 'personal' && !userId) return jsonError('Unauthorized', 401);
    const ownClause = userId
      ? and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id))
      : undefined;
    const publicCatalog = !ownClause || scope === 'public';
    const whereClause = and(
      publicCatalog ? eq(templates.is_public, true) : scope === 'personal' ? ownClause : or(eq(templates.is_public, true), ownClause),
      isNull(templates.deleted_at),
    );

    const listTemplates = async () => {
      const rows = await withRulesColumnFallback((includeRules) =>
        selectTemplatesWithOwner(env, includeRules)
          .where(whereClause)
          .orderBy(desc(templates.created_at)),
      );
      return json(rows.map((t) => parseTemplateRow(t as unknown as Record<string, unknown>)));
    };

    // The public catalog reads every public Template, so serve it from the edge for up to
    // 5 minutes (the app's client staleTime).
    return publicCatalog ? withEdgeCache(request, '/api/templates?scope=public', 5 * 60, listTemplates) : listTemplates();
  }

  if (request.method === 'POST') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    // POST /api/templates/:id/restore
    if (templatesSubpath[0] && templatesSubpath[1] === 'restore') {
      const templateId = templatesSubpath[0];
      if (!templateId || templateId === 'templates') {
        return jsonError('Template ID required', 400);
      }

      const [existingTemplate] = await withRulesColumnFallback((includeRules) =>
        db
          .select(getTemplateSelectColumns(includeRules))
          .from(templates)
          .where(eq(templates.id, templateId))
          .limit(1),
      );
      const templateRecord = existingTemplate as unknown as Record<string, unknown>;

      if (!existingTemplate || !(await canViewTemplateHistory(env, templateRecord, userId))) {
        return jsonError('Template not found', 404);
      }
      if (!(await canEditTemplate(env, templateRecord, userId))) {
        return jsonError('Forbidden', 403);
      }
      if (!(typeof templateRecord.deleted_at === 'string' && templateRecord.deleted_at)) {
        return jsonError('Template is not archived', 400);
      }

      const teamId = templateRecord.owner_type === 'team' && typeof templateRecord.team_id === 'string'
        ? templateRecord.team_id
        : null;
      const entitlements = teamId
        ? await getEntitlementsForContext(env, { type: 'team', teamId, userId })
        : await getEntitlementsForUser(env, userId);
      if (entitlements.plan === 'free' && entitlements.limits.maxTemplates) {
        const [row] = await db
          .select({ count: sql<number>`count(*)` })
          .from(templates)
          .where(
            teamId
              ? and(eq(templates.owner_type, 'team'), eq(templates.team_id, teamId), isNull(templates.deleted_at))
              : and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNull(templates.deleted_at)),
          )
          .limit(1);

        const currentCount = row?.count ?? 0;
        if (currentCount >= entitlements.limits.maxTemplates) {
          return jsonError('Template limit reached. Upgrade to Pro to restore more templates.', 403, {
            code: 'limit_reached',
            details: { limit: entitlements.limits.maxTemplates, current: currentCount, resource: 'templates' },
          });
        }
      }

      const now = new Date().toISOString();
      const restoreUpdates: TemplateUpdateValues = {
        deleted_at: null,
        updated_at: now,
        updated_by_user_id: userId,
        is_public: false,
      };

      const auditEvent = await buildAuditEventValues({
        actorUserId: userId,
        subject: getTemplateSubject(templateRecord, userId),
        resource: { type: 'template', id: templateId },
        action: 'template.restored',
        before: templateRecord,
        after: { ...templateRecord, ...restoreUpdates },
        diff: restoreUpdates as Record<string, unknown>,
        request,
        createdAt: now,
      });
      await db.batch([
        db.update(templates)
          .set(restoreUpdates)
          .where(
            teamId
              ? and(eq(templates.id, templateId), eq(templates.team_id, teamId), isNotNull(templates.deleted_at))
              : and(eq(templates.id, templateId), eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNotNull(templates.deleted_at)),
          ),
        db.insert(audit_events).values(auditEvent),
      ]);

      return json({ success: true });
    }

    // POST /api/templates/:id/clone (Pro only)
    if (templatesSubpath[0] && templatesSubpath[1] === 'clone') {
      const sourceId = templatesSubpath[0];
      let visibility: 'preserve' | 'public' | 'private' = 'private';
      let cloneTeamId: string | null = null;
      try {
        const raw = await request.json();
        if (isRecord(raw)) {
          if (raw.visibility === 'preserve' || raw.visibility === 'public' || raw.visibility === 'private') {
            visibility = raw.visibility;
          }
          if (typeof raw.teamId === 'string' && raw.teamId.trim()) {
            cloneTeamId = raw.teamId.trim();
          } else if (typeof raw.team_id === 'string' && raw.team_id.trim()) {
            cloneTeamId = raw.team_id.trim();
          }
        }
      } catch {
        // allow empty body
      }

      if (cloneTeamId) {
        const accessError = await assertTeamTemplateCreateAccess(env, cloneTeamId, userId);
        if (accessError) return accessError;
      }

      const entitlements = cloneTeamId
        ? await getEntitlementsForContext(env, { type: 'team', teamId: cloneTeamId, userId })
        : await getEntitlementsForUser(env, userId);
      if (entitlements.limits.maxTemplates !== null) {
        const [existingCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(templates)
          .where(
            cloneTeamId
              ? and(eq(templates.owner_type, 'team'), eq(templates.team_id, cloneTeamId), isNull(templates.deleted_at))
              : and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNull(templates.deleted_at)),
          )
          .limit(1);

        const currentCount = existingCount?.count ?? 0;
        if (currentCount >= entitlements.limits.maxTemplates) {
          return jsonError("Template limit reached. Upgrade to Pro to save more templates.", 403, {
            code: 'limit_reached',
            details: { limit: entitlements.limits.maxTemplates, current: currentCount, resource: 'templates' },
          });
        }
      }

      const [source] = await withRulesColumnFallback((includeRules) =>
        db
          .select(getTemplateSelectColumns(includeRules))
          .from(templates)
          .where(and(eq(templates.id, sourceId), isNull(templates.deleted_at)))
          .limit(1),
      );

      if (!source || !source.is_public) {
        return jsonError('Template not found', 404);
      }

      const isPublic = visibility === 'public' ? true : visibility === 'preserve' ? true : false;

      const templateId = crypto.randomUUID();
      const slug = await generateUniqueSlug(env, source.title || '', templateId);
      const now = new Date().toISOString();

      const clonedTemplate: TemplateInsertValues = {
        id: templateId,
        user_id: userId,
        title: source.title || '',
        description: source.description || '',
        type: typeof source.type === 'string' ? source.type : 'checklist',
        seo_title: typeof source.seo_title === 'string' ? source.seo_title : '',
        seo_description: typeof source.seo_description === 'string' ? source.seo_description : '',
        rules: typeof source.rules === 'string' ? source.rules : null,
        items: source.items,
        version: typeof source.version === 'number' ? source.version : 1,
        is_public: isPublic,
        category: source.category,
        tags: source.tags,
        slug,
        owner_type: cloneTeamId ? 'team' : 'user',
        team_id: cloneTeamId,
        created_by_user_id: userId,
        created_at: now,
      };
      const subject: AuditSubject = cloneTeamId ? { type: 'team', id: cloneTeamId } : { type: 'user', id: userId };

      const versionValues = await buildTemplateVersionValues({
        templateId,
        version: typeof clonedTemplate.version === 'number' ? clonedTemplate.version : 1,
        changedByUserId: userId,
        subject,
        snapshot: clonedTemplate as Record<string, unknown>,
        changeSummary: 'template.cloned',
        createdAt: now,
      });
      const auditEvent = await buildAuditEventValues({
        actorUserId: userId,
        subject,
        resource: { type: 'template', id: templateId },
        action: 'template.cloned',
        after: clonedTemplate as Record<string, unknown>,
        metadata: { sourceTemplateId: sourceId },
        request,
        createdAt: now,
      });
      await insertTemplateWithHistoryFallback(db, clonedTemplate, versionValues, auditEvent);

      return json({ id: templateId, slug });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON payload', 400);
    }

    const parsed = templatePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(formatPayloadIssue(parsed.error, 'Invalid template payload'), 400);
    }

    const requestedTeamId = getRequestedTeamId(parsed.data, url);
    if (requestedTeamId) {
      const accessError = await assertTeamTemplateCreateAccess(env, requestedTeamId, userId);
      if (accessError) return accessError;
    }

    const entitlements = requestedTeamId
      ? await getEntitlementsForContext(env, { type: 'team', teamId: requestedTeamId, userId })
      : await getEntitlementsForUser(env, userId);
    if (entitlements.limits.maxTemplates) {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
          .from(templates)
          .where(
            requestedTeamId
              ? and(eq(templates.owner_type, 'team'), eq(templates.team_id, requestedTeamId), isNull(templates.deleted_at))
              : and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNull(templates.deleted_at)),
          )
          .limit(1);

      const currentCount = row?.count ?? 0;
      if (currentCount >= entitlements.limits.maxTemplates) {
        return jsonError('Template limit reached. Upgrade to create more templates.', 403, {
          code: 'limit_reached',
          details: { limit: entitlements.limits.maxTemplates, current: currentCount, resource: 'templates' },
        });
      }
    }

    const { title, description, type, seoTitle, seoDescription, rules, is_public, categories, category, tags, slug: requestedSlug, sections, items: bodyItems } = parsed.data;

    const normalizedSections = normalizeSectionsPayload(sections ?? bodyItems);
    if (normalizedSections.error) {
      return jsonError(normalizedSections.error, 400);
    }
    normalizedSections.sections = assignMissingStableTemplateIdentities(normalizedSections.sections);
    const identityError = validateStableTemplateIdentities(normalizedSections.sections);
    if (identityError) {
      return jsonError(identityError, 400);
    }

    const templateId = crypto.randomUUID();
    const slugSource = typeof requestedSlug === 'string' && requestedSlug.trim() ? requestedSlug.trim() : title || '';
    const slug = await generateUniqueSlug(env, slugSource, templateId);

    const finalCategories = normalizeStringArray(categories ?? category);
    const finalTags = normalizeStringArray(tags);
    const finalType = type ?? 'checklist';
    const isPublic = typeof is_public === 'boolean' ? is_public : false;

    if (title && junkTemplateTitles.has(title)) {
      log('warn', 'junk_template_title_created', { userId, title });
    }

    const now = new Date().toISOString();
    const insertedTemplate: TemplateInsertValues = {
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
      owner_type: requestedTeamId ? 'team' : 'user',
      team_id: requestedTeamId,
      created_by_user_id: userId,
      created_at: now,
    };
    const subject: AuditSubject = requestedTeamId ? { type: 'team', id: requestedTeamId } : { type: 'user', id: userId };

    const versionValues = await buildTemplateVersionValues({
      templateId,
      version: 1,
      changedByUserId: userId,
      subject,
      snapshot: insertedTemplate as Record<string, unknown>,
      changeSummary: 'template.created',
      createdAt: now,
    });
    const auditEvent = await buildAuditEventValues({
      actorUserId: userId,
      subject,
      resource: { type: 'template', id: templateId },
      action: 'template.created',
      after: insertedTemplate as Record<string, unknown>,
      request,
      createdAt: now,
    });
    await insertTemplateWithHistoryFallback(db, insertedTemplate, versionValues, auditEvent);

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

    const parsed = templateUpdatePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(formatPayloadIssue(parsed.error, 'Invalid template payload'), 400);
    }

    const { title, description, type, seoTitle, seoDescription, rules, is_public, categories, category, tags, slug: requestedSlug, sections, items: bodyItems, expected_version } = parsed.data;
    const rawBody = body as Record<string, unknown>;

    // Only update slug if explicitly provided (avoid breaking shared URLs on title edits).
    // A changed slug is normalized to a valid one rather than rejected.
    const requestedSlugValue = requestedSlug
      ? truncateSlug(generateSlug(requestedSlug), TEMPLATE_SLUG_MAX) || null
      : null;

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    let syncedItems: string | null = null;
    let incomingSections: unknown[] | null = null;

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
      incomingSections = normalizedSections.sections;
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

    if (Object.keys(updates).length === 0 && !incomingSections && !requestedSlugValue) {
      return jsonError('No fields to update', 400);
    }

    const [existingTemplate] = await withRulesColumnFallback((includeRules) =>
      db
        .select(getTemplateSelectColumns(includeRules))
        .from(templates)
        .where(eq(templates.id, templateId))
        .limit(1),
    );

    if (!existingTemplate || !(await canViewTemplate(env, existingTemplate as unknown as Record<string, unknown>, userId))) {
      return jsonError('Template not found or unauthorized', 404);
    }
    if (!(await canEditTemplate(env, existingTemplate as unknown as Record<string, unknown>, userId))) {
      return jsonError('Forbidden', 403);
    }
    if (incomingSections) {
      const previousSections = parseJsonArray(existingTemplate.items) ?? [];
      const stableSections = assignMissingStableTemplateIdentities(incomingSections, previousSections);
      const identityError = validateStableTemplateIdentities(stableSections);
      if (identityError) {
        return jsonError(identityError, 400);
      }
      // Clients resend unchanged sections on every save; only a real structure change may
      // bump content_version and reconcile runs.
      if (templateStructureChanged(previousSections, stableSections)) {
        syncedItems = JSON.stringify(stableSections);
        updates.items = syncedItems;
      }
    }
    if (typeof expected_version === 'number' && expected_version !== existingTemplate.version) {
      return jsonError('Template changed since it was loaded. Refresh before saving again.', 409, {
        code: 'edit_conflict',
        details: { expectedVersion: expected_version, currentVersion: existingTemplate.version },
      });
    }

    // Resending the stored slug is not a change, even when it predates today's slug rules.
    if (requestedSlugValue && requestedSlug !== existingTemplate.slug && requestedSlugValue !== existingTemplate.slug) {
      const [conflict] = await db
        .select({ id: templates.id })
        .from(templates)
        .where(and(eq(templates.slug, requestedSlugValue), ne(templates.id, templateId)))
        .limit(1);

      updates.slug = conflict ? withSlugSuffix(requestedSlugValue, templateId.slice(0, 8), TEMPLATE_SLUG_MAX) : requestedSlugValue;
    }

    const changes = omitUnchangedTemplateColumns(existingTemplate as unknown as Record<string, unknown>, updates);
    const invalidField = validateChangedTemplateFields(changes, parsed.data);
    if (invalidField) {
      return jsonError(invalidField, 400);
    }
    const currentVersion = typeof existingTemplate.version === 'number' ? existingTemplate.version : 1;
    const currentContentVersion = typeof existingTemplate.content_version === 'number'
      ? existingTemplate.content_version
      : currentVersion;
    if (Object.keys(changes).length === 0) {
      return json({ success: true, version: currentVersion, content_version: currentContentVersion, structureChanged: false, reconciledRuns: 0 });
    }
    const shouldVersion = isVersionedTemplateChange(changes);
    const nextVersion = shouldVersion ? currentVersion + 1 : currentVersion;
    const nextContentVersion = syncedItems === null ? currentContentVersion : currentContentVersion + 1;
    const templateValues: Record<string, unknown> = { ...changes, updated_at: now, updated_by_user_id: userId };
    if (shouldVersion) {
      templateValues.version = nextVersion;
    }
    if (syncedItems !== null) {
      templateValues.content_version = nextContentVersion;
    }

    if (typeof title === 'string' && junkTemplateTitles.has(title)) {
      log('warn', 'junk_template_title_updated', { userId, templateId, title });
    }

    const templateUpdateWhere = existingTemplate.owner_type === 'team' && existingTemplate.team_id
      ? and(eq(templates.id, templateId), eq(templates.team_id, existingTemplate.team_id), eq(templates.version, currentVersion))
      : and(eq(templates.id, templateId), eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), eq(templates.version, currentVersion));

    const subject = getTemplateSubject(existingTemplate as unknown as Record<string, unknown>, userId);
    const updatedTemplate = {
      ...(existingTemplate as unknown as Record<string, unknown>),
      ...templateValues,
    };

    const versionValues = shouldVersion
      ? await buildTemplateVersionValues({
        templateId,
        version: nextVersion,
        changedByUserId: userId,
        subject,
        snapshot: updatedTemplate,
        changeSummary: 'template.updated',
        createdAt: now,
      })
      : undefined;
    const auditEvent = await buildAuditEventValues({
      actorUserId: userId,
      subject,
      resource: { type: 'template', id: templateId },
      action: 'template.updated',
      before: existingTemplate as unknown as Record<string, unknown>,
      after: updatedTemplate,
      diff: changes,
      request,
      createdAt: now,
    });

    const matchingRuns = syncedItems === null
      ? []
      : await db
          .select()
          .from(checklist_runs)
          .where(
            existingTemplate.owner_type === 'team' && existingTemplate.team_id
              ? and(
                  eq(checklist_runs.template_id, templateId),
                  eq(checklist_runs.team_id, existingTemplate.team_id),
                  eq(checklist_runs.status, 'in_progress'),
                  or(eq(checklist_runs.is_public, false), isNull(checklist_runs.is_public)),
                  isNull(checklist_runs.deleted_at),
                )
              : and(
                  eq(checklist_runs.template_id, templateId),
                  eq(checklist_runs.user_id, userId),
                  isNull(checklist_runs.team_id),
                  eq(checklist_runs.status, 'in_progress'),
                  or(eq(checklist_runs.is_public, false), isNull(checklist_runs.is_public)),
                  isNull(checklist_runs.deleted_at),
                ),
          )
          .orderBy(checklist_runs.created_at);
    const activeRuns = matchingRuns.filter((run): run is typeof run & { id: string } =>
      typeof run.id === 'string'
      && run.status === 'in_progress'
      && !run.is_public
      && !run.deleted_at
    );

    const nextTemplateSections = syncedItems === null ? [] : (parseJsonArray(syncedItems) ?? []);
    const reconciledRunUpdates = activeRuns.map((run) => {
      const previousSections = parseJsonArray(run.items) ?? [];
      const previousRetired = parseJsonArray(run.retired_items) ?? [];
      const reconciled = reconcileRunSections(previousSections, nextTemplateSections, previousRetired);
      const revision = typeof run.revision === 'number' ? run.revision : 1;

      return {
        items: JSON.stringify(reconciled.sections),
        retiredItems: JSON.stringify(reconciled.retired),
        progress: calculateRunProgress(reconciled.sections),
        templateVersion: nextContentVersion,
        revision,
        updatedAt: now,
        whereClause: and(
          eq(checklist_runs.id, run.id),
          eq(checklist_runs.revision, revision),
          eq(checklist_runs.status, 'in_progress'),
          or(eq(checklist_runs.is_public, false), isNull(checklist_runs.is_public)),
          isNull(checklist_runs.deleted_at),
        ),
      };
    });

    let reconciledRuns = 0;
    try {
      const batchResults = await updateTemplateWithHistoryFallback(
        db,
        templateValues as TemplateUpdateValues,
        templateUpdateWhere,
        auditEvent,
        versionValues,
        reconciledRunUpdates,
      );
      if (batchUpdateMissed(batchResults[0])) {
        return jsonError('Template changed while it was being saved. Refresh before saving again.', 409, {
          code: 'edit_conflict',
        });
      }
      // Run updates follow the template update, version insert, and audit insert.
      const runResults = batchResults.slice(versionValues ? 3 : 2);
      reconciledRuns = reconciledRunUpdates.filter((_, index) => !batchUpdateMissed(runResults[index])).length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique constraint failed:.*template_versions|template_versions.*unique/i.test(message)) {
        return jsonError('Template changed while it was being saved. Refresh before saving again.', 409, {
          code: 'edit_conflict',
        });
      }
      throw error;
    }

    return json({
      success: true,
      slug: typeof changes.slug === 'string' ? changes.slug : undefined,
      version: nextVersion,
      content_version: nextContentVersion,
      structureChanged: syncedItems !== null,
      reconciledRuns,
    });
  }

  if (request.method === 'DELETE') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const templateId = url.pathname.split('/').pop();

    if (!templateId || templateId === 'templates') {
      return jsonError('Template ID required', 400);
    }

    // First check if the template exists and belongs to the user.
    const [existingTemplate] = await withRulesColumnFallback((includeRules) =>
      db
        .select(getTemplateSelectColumns(includeRules))
        .from(templates)
        .where(eq(templates.id, templateId))
        .limit(1),
    );

    if (!existingTemplate || !(await canViewTemplate(env, existingTemplate as unknown as Record<string, unknown>, userId))) {
      return jsonError('Template not found or unauthorized', 404);
    }
    if (!(await canEditTemplate(env, existingTemplate as unknown as Record<string, unknown>, userId))) {
      return jsonError('Forbidden', 403);
    }

    const now = new Date().toISOString();
    const archiveUpdates: TemplateUpdateValues = {
      deleted_at: now,
      updated_at: now,
      updated_by_user_id: userId,
      is_public: false,
    };

    const archivedTemplate = {
      ...(existingTemplate as unknown as Record<string, unknown>),
      ...archiveUpdates,
    };

    const auditEvent = await buildAuditEventValues({
      actorUserId: userId,
      subject: getTemplateSubject(existingTemplate as unknown as Record<string, unknown>, userId),
      resource: { type: 'template', id: templateId },
      action: 'template.deleted',
      before: existingTemplate as unknown as Record<string, unknown>,
      after: archivedTemplate,
      diff: archiveUpdates as Record<string, unknown>,
      request,
      createdAt: now,
    });
    await db.batch([
      db.update(templates)
        .set(archiveUpdates)
        .where(
          existingTemplate.owner_type === 'team' && existingTemplate.team_id
            ? and(eq(templates.id, templateId), eq(templates.team_id, existingTemplate.team_id), isNull(templates.deleted_at))
            : and(eq(templates.id, templateId), eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNull(templates.deleted_at)),
        ),
      db.insert(audit_events).values(auditEvent),
    ]);

    return json({ success: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
