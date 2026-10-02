import { Env } from '../types';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '../db';
import {
  formatPayloadIssue,
  normalizeSectionsPayload,
  normalizeStringArray,
  templateImportFieldsSchema,
} from '../utils/payloads';
import { json, jsonError } from '../utils/response';
import { describeErrorForLog, log } from '../utils/logger';
import { getEntitlementsForContext, getEntitlementsForUser } from '../utils/entitlements';
import {
  buildAuditEventValues,
  buildTemplateVersionValues,
  type AuditSubject,
} from '../utils/audit';
import type { TemplateInsertValues } from '../utils/template-writes';
import { z } from 'zod';
import { findStoredSectionsIssue } from '../../../src/lib/schemas/storedSections';
import {
  countOversizedTemplateAssets,
  oversizedTemplateAssetMessage,
} from '../../../src/lib/schemas/templateAssetLimits';
import { TEMPLATE_CONTENT_TOO_LARGE_MESSAGE } from '../../../src/lib/schemas/contentLimits';
import { contentFits } from '../utils/content-limits';
import { buildPortableTemplatePack, parsePortableTemplatePackImport } from '../utils/template-portable';
import {
  assignMissingStableTemplateIdentities,
  findNonObjectTemplateEntry,
  validateStableTemplateIdentities,
} from '../utils/template-reconciliation';
import { generateUniqueSlug, insertTemplateWithUniqueSlug } from '../utils/template-insert';
import {
  getTemplateSelectColumns,
  parseTemplateRow,
  withRulesColumnFallback,
  type TemplateDb,
} from '../utils/template-rows';
import { assertTeamTemplateCreateAccess } from '../utils/template-permissions';

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

type TemplateImportFailureCode = 'invalid_fields' | 'invalid_sections' | 'oversized_asset' | 'content_too_large' | 'insert_failed';

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

const MAX_TEMPLATES_PER_IMPORT = 5;

type BackupContext = { env: Env; db: TemplateDb; userId: string; backupTeamId: string | null };

async function exportTemplateBackup({ db, userId, backupTeamId }: BackupContext, url: URL): Promise<Response> {
  const { templates, users } = schema;
  const exportFormat = url.searchParams.get('format') === 'backup' ? 'backup' : 'portable';
  const whereClause = backupTeamId
    ? and(eq(templates.owner_type, 'team'), eq(templates.team_id, backupTeamId), isNull(templates.deleted_at))
    : and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNull(templates.deleted_at));

  const rows = await withRulesColumnFallback((includeRules) =>
    db
      .select(getTemplateSelectColumns(includeRules))
      .from(templates)
      .where(whereClause)
      .orderBy(desc(templates.created_at)),
  );

  const [userRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);

  const exportedTemplates = rows.map((row) => {
    const parsed = parseTemplateRow(row);
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

const portablePackKindSchema = z.object({ kind: z.literal('serplists-template-pack') });

async function importTemplateBackup({ env, db, userId, backupTeamId }: BackupContext, request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON payload', 400);
  }

  let fileIndexes: number[] | null = null;
  let portableFailures: TemplateImportFailure[] = [];
  if (portablePackKindSchema.safeParse(body).success) {
    const portable = parsePortableTemplatePackImport(body);
    if ('response' in portable) return portable.response;
    body = { templates: portable.templates };
    fileIndexes = portable.sourceIndexes;
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
    const index = fileIndexes?.[position] ?? position;
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
    const sectionsError = normalizedSections.error
      ?? findNonObjectTemplateEntry(normalizedSections.sections)
      ?? findStoredSectionsIssue(normalizedSections.sections);
    if (sectionsError) {
      summary.failed.push({
        index,
        title: template.title,
        reason: sectionsError,
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

    if (!contentFits('template', normalizedSections.sections)) {
      summary.failed.push({ index, title: template.title, reason: TEMPLATE_CONTENT_TOO_LARGE_MESSAGE, code: 'content_too_large' });
      continue;
    }

    if (countOversizedTemplateAssets(normalizedSections.sections) > 0) {
      summary.failed.push({
        index,
        title: template.title,
        reason: oversizedTemplateAssetMessage(),
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
    const now = new Date().toISOString();
    const subject: AuditSubject = backupTeamId ? { type: 'team', id: backupTeamId } : { type: 'user', id: userId };

    try {
      const inserted = await insertTemplateWithUniqueSlug(db, {
        title: fields.data.title,
        slug: await generateUniqueSlug(env, fields.data.title, templateId),
        buildRows: async (candidateSlug) => {
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
            slug: candidateSlug,
            owner_type: backupTeamId ? 'team' : 'user',
            team_id: backupTeamId,
            created_by_user_id: userId,
            created_at: now,
            updated_at: now,
          };
          return {
            template: insertedTemplate,
            version: await buildTemplateVersionValues({
              templateId,
              version: 1,
              changedByUserId: userId,
              subject,
              snapshot: insertedTemplate as Record<string, unknown>,
              changeSummary: 'template.imported',
              createdAt: now,
            }),
            audit: await buildAuditEventValues({
              actorUserId: userId,
              subject,
              resource: { type: 'template', id: templateId },
              action: 'template.imported',
              after: insertedTemplate as Record<string, unknown>,
              metadata: { source: 'backup_import', importIndex: index, teamId: backupTeamId },
              request,
              createdAt: now,
            }),
          };
        },
      });
      if (!('slug' in inserted)) throw new Error('templates.slug was taken on every attempt');
      const { slug } = inserted;
      summary.imported += 1;
      summary.successes.push({
        index,
        title: template.title,
        id: templateId,
        slug,
        visibility: isPublic ? 'public' : 'private',
      });
    } catch (err) {
      log('error', 'template_import_insert_failed', {
        userId,
        index,
        ...describeErrorForLog(err),
      });
      summary.failed.push({
        index,
        title: template.title,
        reason: 'Could not save this template. Try importing it again.',
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

export async function handleTemplateBackup(
  request: Request,
  env: Env,
  db: TemplateDb,
  url: URL,
  userId: string,
): Promise<Response> {
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

  const context = { env, db, userId, backupTeamId };
  if (request.method === 'GET') return exportTemplateBackup(context, url);
  if (request.method === 'POST') return importTemplateBackup(context, request);
  return new Response('Method Not Allowed', { status: 405 });
}
