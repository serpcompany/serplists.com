import { Env } from '../types';
import { decodeSlugPath, resolveRequestedSlug } from '../utils/slug';
import { isReservedTemplateSlug } from '../utils/reserved-template-slugs';
import { and, desc, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { createDb, schema } from '../db';
import {
  describePayloadError,
  formatPayloadIssue,
  normalizeSectionsPayload,
  normalizeStringArray,
  parseJsonArray,
  parseSectionsPayload,
  templateImportFieldsSchema,
  templatePayloadSchema,
  templateUpdatePayloadSchema,
} from '../utils/payloads';
import { json, jsonError } from '../utils/response';
import { withEdgeCache } from '../utils/edge-cache';
import { describeErrorForLog, log } from '../utils/logger';
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
  serializeTemplateVersionHistory,
} from '../utils/history-queries';
import { insertRowWhere, rowExistsSql } from '../utils/guarded-insert';
import { personalProRequiredResponse } from '../utils/limit-reached';
import {
  countTemplates,
  isMissingRulesColumnError,
  templateCapacityAvailableSql,
  templateLimitResponse,
  updateTemplateWithHistoryFallback,
  type ReconciledRunUpdate,
  type TemplateInsertValues,
  type TemplateUpdateValues,
} from '../utils/template-writes';
import { batchUpdateMissed } from '../utils/checklist-runs';
import { canEditTeamTemplates, canViewTeam, getActiveTeamMembership, normalizeTeamRole } from '../utils/team-access';
import { z } from 'zod';
import { portableTemplateRuleSchema } from '../../../src/lib/schemas/checklistSchema';
import { findStoredSectionsIssue } from '../../../src/lib/schemas/storedSections';
import {
  countOversizedTemplateAssets,
  oversizedTemplateAssetMessage,
} from '../../../src/lib/schemas/templateAssetLimits';
import { TEMPLATE_CONTENT_TOO_LARGE_MESSAGE } from '../../../src/lib/schemas/contentLimits';
import { contentFits, contentTooLargeResponse } from '../utils/content-limits';
import { buildPortableTemplatePack, parsePortableTemplatePackImport } from '../utils/template-portable';
import {
  assignMissingStableTemplateIdentities,
  calculateRunProgress,
  findNonObjectTemplateEntry,
  reconcileRunSections,
  summarizeRetiredEntries,
  validateStableTemplateIdentities,
} from '../utils/template-reconciliation';
import { withStableItemsColumn, withStableTemplateIdentities } from '../utils/template-identities';
import {
  omitUnchangedTemplateColumns,
  requestsContentChange,
  visibilityChangeMetadata,
  templateStructureChanged,
  validateChangedTemplateFields,
} from '../utils/template-changes';
import {
  findFreeSuffixedSlug,
  generateUniqueSlug,
  isTemplateSlugUniqueViolation,
  insertTemplateWithUniqueSlug,
  newTemplateResponse,
  type NewTemplateRows,
} from '../utils/template-insert';
import { isOwnPersonalTemplateRow, toPublicTemplate } from '../utils/template-public';

const junkTemplateTitles = new Set(['Test Template', 'Updated Template Title']);

type QueryResult<T> = PromiseLike<T> | T;

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

function slugInUseResponse(slug: string): Response {
  return jsonError('Another template uses this URL slug. Choose a different slug.', 409, { code: 'slug_taken', details: { slug } });
}

function parseTemplateRow<T extends Record<string, unknown>>(template: T) {
  let sections: unknown[] = [];
  if (typeof template.items !== 'undefined') {
    const normalized = normalizeSectionsPayload(template.items);
    if (normalized.error) {
      log('warn', 'template_items_parse_failed', { templateId: template.id });
    } else {
      // Entries stored without ids get the ones a save would store, so the editor resends them.
      sections = withStableTemplateIdentities(normalized.sections);
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

  // The raw items column is sent only as parsed `sections`; resending it would double every
  // template list and detail response (clients read `sections`).
  const { items: _items, ...columns } = template;
  return {
    ...columns,
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

// The owner of a Personal template, or a member of the Organization that owns it.
async function canViewPrivateTemplate(env: Env, template: Record<string, unknown>, userId: string): Promise<boolean> {
  if (template.owner_type === 'team' && typeof template.team_id === 'string' && template.team_id) {
    const membership = await getActiveTeamMembership(env, template.team_id, userId);
    return membership ? canViewTeam(normalizeTeamRole(membership.role)) : false;
  }

  return template.user_id === userId;
}

// The whole row for its owner or an Organization member. Anyone else who may view it (a
// public template) gets only PUBLIC_TEMPLATE_FIELDS; null means not found for this viewer.
async function serializeTemplateForViewer(env: Env, row: Record<string, unknown>, userId: string | null) {
  if (typeof row.deleted_at === 'string' && row.deleted_at) return null;
  if (userId && (await canViewPrivateTemplate(env, row, userId))) return parseTemplateRow(row);
  return row.is_public === true || row.is_public === 1 ? toPublicTemplate(parseTemplateRow(row)) : null;
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

type TemplateWriteOptions = {
  // Run Key writes (the MCP): only the key owner's Personal templates, never a public one.
  personalOnly?: boolean;
  // Added to the audit events the write records; the MCP names the Run Key there.
  auditMetadata?: Record<string, unknown>;
};

// POST /api/templates, and the MCP's create_template.
export async function createTemplateForUser(
  request: Request,
  env: Env,
  userId: string,
  body: unknown,
  options: TemplateWriteOptions = {},
): Promise<Response> {
  const db = createDb(env);

  const parsed = templatePayloadSchema.safeParse(body);
  if (!parsed.success) {
    const { message, details } = describePayloadError(parsed.error, 'Invalid template payload');
    return jsonError(message, 400, { details });
  }

  const requestedTeamId = options.personalOnly ? null : getRequestedTeamId(parsed.data, new URL(request.url));
  if (requestedTeamId) {
    const accessError = await assertTeamTemplateCreateAccess(env, requestedTeamId, userId);
    if (accessError) return accessError;
  }

  const entitlements = requestedTeamId
    ? await getEntitlementsForContext(env, { type: 'team', teamId: requestedTeamId, userId })
    : await getEntitlementsForUser(env, userId);
  const createCapacity = entitlements.limits.maxTemplates
    ? { owner: { userId, teamId: requestedTeamId }, limit: entitlements.limits.maxTemplates }
    : undefined;
  if (createCapacity) {
    const currentCount = await countTemplates(env, createCapacity.owner);
    if (currentCount >= createCapacity.limit) return templateLimitResponse(createCapacity.owner, 'create', createCapacity.limit, currentCount);
  }

  const { title, description, type, seoTitle, seoDescription, rules, is_public, categories, category, tags, slug: requestedSlug, sections, items: bodyItems } = parsed.data;

  const normalizedSections = parseSectionsPayload(sections ?? bodyItems);
  if (normalizedSections.error) {
    return jsonError(normalizedSections.error, 400);
  }
  normalizedSections.sections = assignMissingStableTemplateIdentities(normalizedSections.sections);
  const identityError = validateStableTemplateIdentities(normalizedSections.sections);
  if (identityError) {
    return jsonError(identityError, 400);
  }
  const tooLarge = contentTooLargeResponse('template', normalizedSections.sections);
  if (tooLarge) return tooLarge;

  const templateId = crypto.randomUUID();
  const slugSource = typeof requestedSlug === 'string' && requestedSlug.trim() ? requestedSlug.trim() : title || '';

  const finalCategories = normalizeStringArray(categories ?? category);
  const finalTags = normalizeStringArray(tags);
  const finalType = type ?? 'checklist';
  const isPublic = typeof is_public === 'boolean' ? is_public : false;

  if (title && junkTemplateTitles.has(title)) {
    log('warn', 'junk_template_title_created', { userId, title });
  }

  const now = new Date().toISOString();
  const subject: AuditSubject = requestedTeamId ? { type: 'team', id: requestedTeamId } : { type: 'user', id: userId };
  const buildRows = async (candidateSlug: string): Promise<NewTemplateRows> => {
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
      slug: candidateSlug,
      owner_type: requestedTeamId ? 'team' : 'user',
      team_id: requestedTeamId,
      created_by_user_id: userId,
      created_at: now,
      updated_at: now,
    };
    const snapshot = insertedTemplate as Record<string, unknown>;
    return {
      template: insertedTemplate,
      version: await buildTemplateVersionValues({
        templateId, version: 1, changedByUserId: userId, subject, snapshot, changeSummary: 'template.created', createdAt: now,
      }),
      audit: await buildAuditEventValues({
        actorUserId: userId,
        subject,
        resource: { type: 'template', id: templateId },
        action: 'template.created',
        after: snapshot,
        metadata: options.auditMetadata,
        request,
        createdAt: now,
      }),
    };
  };
  const inserted = await insertTemplateWithUniqueSlug(db, {
    title: slugSource, slug: await generateUniqueSlug(env, slugSource, templateId), buildRows, capacity: createCapacity,
  });

  return newTemplateResponse(env, templateId, inserted, createCapacity, 'create');
}

// PUT /api/templates/:id, and the MCP's update_template.
export async function updateTemplateForUser(
  request: Request,
  env: Env,
  userId: string,
  templateId: string,
  body: unknown,
  options: TemplateWriteOptions = {},
): Promise<Response> {
  const db = createDb(env);
  const { templates, checklist_runs } = schema;

  const parsed = templateUpdatePayloadSchema.safeParse(body);
  if (!parsed.success) {
    const { message, details } = describePayloadError(parsed.error, 'Invalid template payload');
    return jsonError(message, 400, { details });
  }

  const { title, description, type, seoTitle, seoDescription, rules, is_public, categories, category, tags, slug: requestedSlug, sections, items: bodyItems, expected_version } = parsed.data;
  const rawBody = body as Record<string, unknown>;

  // Only update slug if explicitly provided (avoid breaking shared URLs on title edits).
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
    const normalizedSections = parseSectionsPayload(sections ?? bodyItems);
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

  if (Object.keys(updates).length === 0 && !incomingSections && !requestedSlug?.trim()) {
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
  if (options.personalOnly && !isOwnPersonalTemplateRow(existingTemplate as unknown as Record<string, unknown>, userId)) {
    return jsonError('Template not found or unauthorized', 404);
  }
  if (options.personalOnly && Boolean(existingTemplate.is_public)) {
    return jsonError('Public templates can only be edited in SERP Lists', 403, { code: 'template_is_public' });
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
      const tooLarge = contentTooLargeResponse('template', stableSections, previousSections);
      if (tooLarge) return tooLarge;
      syncedItems = JSON.stringify(stableSections);
      updates.items = syncedItems;
    }
  }
  const slugRequest = resolveRequestedSlug(requestedSlug, existingTemplate.slug);
  if (slugRequest.kind === 'invalid') return jsonError(slugRequest.message, 400);
  // A content edit must say which version it was based on; without one the check
  // would be skipped and a stale editor would overwrite newer work.
  const versionRequired = requestsContentChange(rawBody, slugRequest.kind === 'changed');
  if (typeof expected_version === 'number' ? expected_version !== existingTemplate.version : versionRequired) {
    return jsonError('Template changed since it was loaded. Refresh before saving again.', 409, {
      code: 'edit_conflict',
      details: { expectedVersion: expected_version, currentVersion: existingTemplate.version },
    });
  }

  // A body whose only field is the stored slug asks for nothing.
  if (slugRequest.kind === 'unchanged' && Object.keys(updates).length === 0 && !incomingSections) {
    return jsonError('No fields to update', 400);
  }
  if (slugRequest.kind === 'changed') {
    const requestedSlugValue = slugRequest.slug;
    const [conflict] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.slug, requestedSlugValue), ne(templates.id, templateId)))
      .limit(1);

    // A requested slug a bundled starter holds is taken too (the Template keeps a slug it
    // already has: resolveRequestedSlug never reports that as a change).
    const slug = conflict || isReservedTemplateSlug(requestedSlugValue)
      ? await findFreeSuffixedSlug(db, requestedSlugValue, templateId)
      : requestedSlugValue;
    if (!slug) return slugInUseResponse(requestedSlugValue);
    updates.slug = slug;
  }

  const changes = omitUnchangedTemplateColumns(existingTemplate as unknown as Record<string, unknown>, updates);
  const invalidField = validateChangedTemplateFields(changes, parsed.data);
  if (invalidField) {
    return jsonError(invalidField.message, 400, { details: invalidField.details });
  }
  const currentVersion = typeof existingTemplate.version === 'number' ? existingTemplate.version : 1;
  const currentContentVersion = typeof existingTemplate.content_version === 'number'
    ? existingTemplate.content_version
    : currentVersion;
  if (Object.keys(changes).length === 0) {
    return json({
      success: true,
      id: templateId,
      slug: existingTemplate.slug ?? undefined,
      version: currentVersion,
      content_version: currentContentVersion,
      structureChanged: false,
      reconciledRuns: 0,
    });
  }
  // Every stored change is a new version, visibility included, so an editor loaded before
  // a Share gets 409 instead of silently reverting it. content_version (run staleness and
  // reconciliation) still moves only when the checklist structure changes.
  const nextVersion = currentVersion + 1;
  const nextContentVersion = syncedItems === null ? currentContentVersion : currentContentVersion + 1;
  const templateValues: Record<string, unknown> = { ...changes, version: nextVersion, updated_at: now, updated_by_user_id: userId };
  if (syncedItems !== null) {
    templateValues.content_version = nextContentVersion;
  }

  if (typeof title === 'string' && junkTemplateTitles.has(title)) {
    log('warn', 'junk_template_title_updated', { userId, templateId, title });
  }

  const ownedTemplateWhere = existingTemplate.owner_type === 'team' && existingTemplate.team_id
    ? and(eq(templates.id, templateId), eq(templates.team_id, existingTemplate.team_id), eq(templates.version, currentVersion), isNull(templates.deleted_at))
    : and(eq(templates.id, templateId), eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), eq(templates.version, currentVersion), isNull(templates.deleted_at));
  // A Run Key's edit lands only while the template is still private; every statement in the
  // batch below requires this row to match.
  const templateUpdateWhere = options.personalOnly
    ? and(ownedTemplateWhere, or(eq(templates.is_public, false), isNull(templates.is_public)))
    : ownedTemplateWhere;

  const subject = getTemplateSubject(existingTemplate as unknown as Record<string, unknown>, userId);
  const updatedTemplate = {
    ...(existingTemplate as unknown as Record<string, unknown>),
    ...templateValues,
  };

  const versionValues = await buildTemplateVersionValues({
    templateId,
    version: nextVersion,
    changedByUserId: userId,
    subject,
    snapshot: updatedTemplate,
    changeSummary: 'template.updated',
    createdAt: now,
  });
  const visibilityChange = visibilityChangeMetadata(changes);
  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject,
    resource: { type: 'template', id: templateId },
    action: 'template.updated',
    before: existingTemplate as unknown as Record<string, unknown>,
    after: updatedTemplate,
    diff: changes,
    // History lists return metadata, not diffs: the Changelog labels a Share or switch by it.
    metadata: visibilityChange || options.auditMetadata ? { ...visibilityChange, ...options.auditMetadata } : undefined,
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
  const reconciledRunUpdates = (await Promise.all(activeRuns.map(async (run): Promise<ReconciledRunUpdate | null> => {
    const previousSections = parseJsonArray(run.items) ?? [];
    const previousRetired = parseJsonArray(run.retired_items) ?? [];
    const reconciled = reconcileRunSections(previousSections, nextTemplateSections, previousRetired);
    // A run the change would grow past what its page can save keeps its content and shows
    // as stale; Revalidate then explains why it cannot take the change.
    if (!contentFits('run', reconciled.sections, previousSections)) {
      log('warn', 'run_reconcile_skipped_content_too_large', { templateId, runId: run.id });
      return null;
    }
    const revision = typeof run.revision === 'number' ? run.revision : 1;
    const items = JSON.stringify(reconciled.sections);
    const runChanged = reconciled.newlyRetired.length > 0 || items !== JSON.stringify(previousSections);

    return {
      items,
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
      // The run's Changelog records the save. The event names retired work by id and
      // title; its notes stay in the run's retired_items.
      auditEvent: runChanged
        ? await buildAuditEventValues({
          actorUserId: userId,
          subject,
          resource: { type: 'checklist_run', id: run.id },
          action: 'checklist_run.reconciled',
          metadata: {
            templateId,
            templateVersion: nextContentVersion,
            fromRevision: revision,
            toRevision: revision + 1,
            retired: summarizeRetiredEntries(reconciled.newlyRetired),
            ...options.auditMetadata,
          },
          request,
          createdAt: now,
        })
        : undefined,
    };
  }))).filter((update): update is ReconciledRunUpdate => update !== null);

  let reconciledRuns = 0;
  try {
    const { updated, runResults } = await updateTemplateWithHistoryFallback(
      db,
      templateValues as TemplateUpdateValues,
      templateUpdateWhere,
      auditEvent,
      versionValues,
      reconciledRunUpdates,
    );
    if (!updated) {
      return jsonError('Template changed while it was being saved. Refresh before saving again.', 409, {
        code: 'edit_conflict',
      });
    }
    reconciledRuns = runResults.filter((result) => !batchUpdateMissed(result)).length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unique constraint failed:.*template_versions|template_versions.*unique/i.test(message)) {
      return jsonError('Template changed while it was being saved. Refresh before saving again.', 409, {
        code: 'edit_conflict',
      });
    }
    // Another save claimed the slug between the check above and this write.
    if (isTemplateSlugUniqueViolation(error) && typeof changes.slug === 'string') {
      return slugInUseResponse(changes.slug);
    }
    throw error;
  }

  // The next save sends this version as expected_version. The slug is the one the template
  // has after the write, requested (it may carry a -<id8> suffix) or kept, so the editor
  // never guesses.
  return json({
    success: true,
    id: templateId,
    slug: typeof changes.slug === 'string' ? changes.slug : existingTemplate.slug ?? undefined,
    version: nextVersion,
    content_version: nextContentVersion,
    structureChanged: syncedItems !== null,
    reconciledRuns,
  });
}

export async function handleTemplates(request: Request, env: Env): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "templates", ...]
  const templatesSubpath = pathParts.slice(2); // after /api/templates
  const db = createDb(env);
  const { templates, users, audit_events } = schema;

  // Pro-only: export/import templates as JSON backup
  // GET  /api/templates/backup?teamId=...&format=portable|backup (owned templates only)
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
      // Only the active context's own templates. The page adds public templates from the
      // edge-cached catalog, so an export never reads every public template from D1; an
      // old tab's includePublic=1 is ignored (see the D1 cost doc).
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
        // A text or null entry is named the way a person reads the file ("Task 2 in section 1")
        // before the stored-content check, whose message is a JSON path.
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

        // A pack may be up to 2MB, but the editor resends one template under the 1MB limit.
        if (!contentFits('template', normalizedSections.sections)) {
          summary.failed.push({ index, title: template.title, reason: TEMPLATE_CONTENT_TOO_LARGE_MESSAGE, code: 'content_too_large' });
          continue;
        }

        // The upload limit: an asset the uploader accepted always imports again.
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
          // The reason is shown to the user; the database error stays in the logs.
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

      return json(rows.map((t) => toPublicTemplate(parseTemplateRow(t as unknown as Record<string, unknown>))));
    }

    // GET /api/templates/slug/:slug
    if (templatesSubpath[0] === 'slug' && templatesSubpath[1]) {
      const slug = decodeSlugPath(templatesSubpath.slice(1));
      if (!slug) return jsonError('Template not found', 404);
      const [template] = await withRulesColumnFallback((includeRules) =>
        selectTemplatesWithOwner(env, includeRules)
          .where(and(eq(templates.slug, slug), isNull(templates.deleted_at)))
          .limit(1),
      );

      const body = template ? await serializeTemplateForViewer(env, template as unknown as Record<string, unknown>, userId) : null;
      return body ? json(body) : jsonError('Template not found', 404);
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

      if (!template || !(await canViewPrivateTemplate(env, template as unknown as Record<string, unknown>, userId))) {
        return jsonError('Template not found', 404);
      }

      try {
        // The Changelog merges both lists: archive and restore record only an event, and a
        // Share's event labels its version (templateHistoryTimeline.ts). Both reads stop at
        // LIMIT on an index.
        const [versionRows, eventRows] = await Promise.all([
          selectTemplateVersionHistory(db, templateId, historyLimit),
          selectAuditEventHistory(db, 'template', templateId, historyLimit),
        ]);
        const events = eventRows.map(serializeHistoryEvent);

        return json({
          templateId,
          subject: getTemplateSubject(template as unknown as Record<string, unknown>, userId),
          versions: serializeTemplateVersionHistory(versionRows, events),
          events,
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

      const body = template ? await serializeTemplateForViewer(env, template as unknown as Record<string, unknown>, userId) : null;
      return body ? json(body) : jsonError('Template not found', 404);
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
      // Only the user's own Personal rows are sent whole. The catalog is one body for every
      // visitor, so it always carries public fields only, even the user's own templates.
      return json(rows.map((t) => {
        const row = t as unknown as Record<string, unknown>;
        return !publicCatalog && isOwnPersonalTemplateRow(row, userId) ? parseTemplateRow(row) : toPublicTemplate(parseTemplateRow(row));
      }));
    };

    // The public catalog reads every public Template, so serve it from the edge for up to
    // 5 minutes (the app's client staleTime). The key names the response shape, so a deploy
    // that changes the shape never serves the previous one from the edge.
    return publicCatalog ? withEdgeCache(request, '/api/templates?scope=public&fields=public', 5 * 60, listTemplates) : listTemplates();
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

      if (!existingTemplate || !(await canViewPrivateTemplate(env, templateRecord, userId))) {
        return jsonError('Template not found', 404);
      }
      if (!(await canEditTemplate(env, templateRecord, userId))) {
        return jsonError('Forbidden', 403);
      }
      if (!(typeof templateRecord.deleted_at === 'string' && templateRecord.deleted_at)) {
        return jsonError('Template is not archived', 400, { code: 'not_archived' });
      }

      const teamId = templateRecord.owner_type === 'team' && typeof templateRecord.team_id === 'string'
        ? templateRecord.team_id
        : null;
      const entitlements = teamId
        ? await getEntitlementsForContext(env, { type: 'team', teamId, userId })
        : await getEntitlementsForUser(env, userId);
      const owner = { userId, teamId };
      const limit = entitlements.plan === 'free' && entitlements.limits.maxTemplates ? entitlements.limits.maxTemplates : null;
      if (limit !== null) {
        const currentCount = await countTemplates(env, owner);
        if (currentCount >= limit) return templateLimitResponse(owner, 'restore', limit, currentCount);
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
      const archivedTemplate = teamId
        ? and(eq(templates.team_id, teamId), isNotNull(templates.deleted_at))
        : and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNotNull(templates.deleted_at));
      // With a limit, the restore re-checks it in the same statement. The audit row is written
      // first and only while the restore will apply, so a lost race records nothing.
      const restoreGuard = limit === null ? archivedTemplate : and(archivedTemplate, templateCapacityAvailableSql({ owner, limit }));
      const restoreResults = await db.batch([
        insertRowWhere(db, audit_events, auditEvent, rowExistsSql(templates.id, templateId, restoreGuard)),
        db.update(templates).set(restoreUpdates).where(and(eq(templates.id, templateId), restoreGuard)),
      ]);
      if (batchUpdateMissed(restoreResults[1])) {
        if (limit !== null) {
          const currentCount = await countTemplates(env, owner);
          if (currentCount >= limit) return templateLimitResponse(owner, 'restore', limit, currentCount);
        }
        // A concurrent request restored it first.
        return jsonError('Template is not archived', 400, { code: 'not_archived' });
      }

      return json({ success: true });
    }

    // POST /api/templates/:id/clone: Pro only into Personal; Organization copies follow the
    // Organization's role and template limit (see pricing-and-entitlements.md).
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
      if (!cloneTeamId && entitlements.plan !== 'pro') {
        return personalProRequiredResponse('copy public templates into Personal');
      }
      const cloneCapacity = entitlements.limits.maxTemplates !== null
        ? { owner: { userId, teamId: cloneTeamId }, limit: entitlements.limits.maxTemplates }
        : undefined;
      if (cloneCapacity) {
        const currentCount = await countTemplates(env, cloneCapacity.owner);
        if (currentCount >= cloneCapacity.limit) return templateLimitResponse(cloneCapacity.owner, 'save', cloneCapacity.limit, currentCount);
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
      const sourceTooLarge = contentTooLargeResponse('template', normalizeSectionsPayload(source.items).sections);
      if (sourceTooLarge) return sourceTooLarge;

      const isPublic = visibility === 'public' ? true : visibility === 'preserve' ? true : false;

      const templateId = crypto.randomUUID();
      const now = new Date().toISOString();
      const subject: AuditSubject = cloneTeamId ? { type: 'team', id: cloneTeamId } : { type: 'user', id: userId };

      const buildRows = async (candidateSlug: string): Promise<NewTemplateRows> => {
        const clonedTemplate: TemplateInsertValues = {
          id: templateId,
          user_id: userId,
          title: source.title || '',
          description: source.description || '',
          type: typeof source.type === 'string' ? source.type : 'checklist',
          seo_title: typeof source.seo_title === 'string' ? source.seo_title : '',
          seo_description: typeof source.seo_description === 'string' ? source.seo_description : '',
          rules: typeof source.rules === 'string' ? source.rules : null,
          // A source stored without ids gives its copy the ids its editor and runs use.
          items: withStableItemsColumn(source.items),
          // A copy is a new template: its edit counter and content version start at 1, like
          // create and import. The source's counters are provenance, kept in the audit event.
          version: 1,
          content_version: 1,
          is_public: isPublic,
          category: source.category,
          tags: source.tags,
          slug: candidateSlug,
          owner_type: cloneTeamId ? 'team' : 'user',
          team_id: cloneTeamId,
          created_by_user_id: userId,
          created_at: now,
          updated_at: now,
        };
        const snapshot = clonedTemplate as Record<string, unknown>;
        return {
          template: clonedTemplate,
          version: await buildTemplateVersionValues({
            templateId, version: 1, changedByUserId: userId, subject, snapshot, changeSummary: 'template.cloned', createdAt: now,
          }),
          audit: await buildAuditEventValues({
            actorUserId: userId,
            subject,
            resource: { type: 'template', id: templateId },
            action: 'template.cloned',
            after: snapshot,
            metadata: {
              sourceTemplateId: sourceId,
              sourceVersion: typeof source.version === 'number' ? source.version : null,
              sourceContentVersion: typeof source.content_version === 'number' ? source.content_version : null,
            },
            request,
            createdAt: now,
          }),
        };
      };
      const title = source.title || '';
      const inserted = await insertTemplateWithUniqueSlug(db, {
        title, slug: await generateUniqueSlug(env, title, templateId), buildRows, capacity: cloneCapacity,
      });

      return newTemplateResponse(env, templateId, inserted, cloneCapacity, 'save');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON payload', 400);
    }

    return createTemplateForUser(request, env, userId, body);
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

    return updateTemplateForUser(request, env, userId, templateId, body);
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
    const activeTemplate = existingTemplate.owner_type === 'team' && existingTemplate.team_id
      ? and(eq(templates.team_id, existingTemplate.team_id), isNull(templates.deleted_at))
      : and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNull(templates.deleted_at));
    // The audit row is written first and only while the template is still active.
    const archiveResults = await db.batch([
      insertRowWhere(db, audit_events, auditEvent, rowExistsSql(templates.id, templateId, activeTemplate)),
      db.update(templates).set(archiveUpdates).where(and(eq(templates.id, templateId), activeTemplate)),
    ]);
    if (batchUpdateMissed(archiveResults[1])) {
      // A concurrent request archived it first.
      return jsonError('Template not found or unauthorized', 404);
    }

    return json({ success: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
