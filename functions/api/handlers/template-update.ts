import { Env } from '../types';
import { resolveRequestedSlug } from '../utils/slug';
import { isReservedTemplateSlug } from '../utils/reserved-template-slugs';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { createDb, schema } from '../db';
import {
  describePayloadError,
  parseSectionsPayload,
  templateUpdatePayloadSchema,
} from '../utils/payloads';
import { normalizeStringArray, parseJsonArray } from '../../../src/lib/schemas/jsonArrays';
import { toStoredRequiredTools } from '../../../src/lib/schemas/requiredTools';
import { log } from '../utils/logger';
import { buildAuditEventValues, buildTemplateVersionValues } from '../utils/audit';
import {
  updateTemplateWithHistoryFallback,
  type ReconciledRunUpdate,
  type TemplateUpdateValues,
} from '../utils/template-writes';
import { batchWriteMissed } from '../utils/guarded-writes';
import { contentFits, contentTooLargeRefusal } from '../utils/content-limits';
import {
  assignMissingStableTemplateIdentities,
  calculateRunProgress,
  reconcileRunSections,
  summarizeRetiredEntries,
  validateStableTemplateIdentities,
} from '../utils/template-reconciliation';
import {
  omitUnchangedTemplateColumns,
  requestsContentChange,
  visibilityChangeMetadata,
  templateStructureChanged,
  validateChangedTemplateFields,
} from '../utils/template-changes';
import { findFreeSuffixedSlug, isTemplateSlugUniqueViolation } from '../utils/template-insert';
import { isUniqueViolationOn } from '../utils/unique-violation';
import { isOwnPersonalTemplateRow } from '../utils/template-public';
import { findTemplateById } from '../utils/template-rows';
import { canEditTemplate, canViewTemplate, getTemplateSubject } from '../utils/template-permissions';
import { refuse, type WriteResult } from '../utils/write-refusal';
import { junkTemplateTitles, type TemplateWriteOptions } from './template-create';

export type UpdatedTemplate = {
  success: true;
  id: string;
  slug: string | undefined;
  version: number;
  content_version: number;
  structureChanged: boolean;
  reconciledRuns: number;
};

function slugInUse(slug: string) {
  return refuse('Another template uses this URL slug. Choose a different slug.', 409, { code: 'slug_taken', details: { slug } });
}

const editConflictWhileSaving = () =>
  refuse('Template changed while it was being saved. Refresh before saving again.', 409, { code: 'edit_conflict' });

export async function updateTemplateForUser(
  request: Request,
  env: Env,
  userId: string,
  templateId: string,
  body: unknown,
  options: TemplateWriteOptions = {},
): Promise<WriteResult<UpdatedTemplate>> {
  const db = createDb(env);
  const { templates, checklistRuns } = schema;

  const parsed = templateUpdatePayloadSchema.safeParse(body);
  if (!parsed.success) {
    const { message, details } = describePayloadError(parsed.error, 'Invalid template payload');
    return refuse(message, 400, { details });
  }

  const { title, description, type, seoTitle, seoDescription, rules, requiredTools, is_public, categories, category, tags, slug: requestedSlug, sections, items: bodyItems, expected_version } = parsed.data;

  const now = new Date().toISOString();
  const updates: TemplateUpdateValues = {};
  let syncedItems: string | null = null;
  let incomingSections: unknown[] | null = null;

  if (typeof title !== 'undefined') {
    updates.title = title || '';
  }
  if (typeof description !== 'undefined') {
    updates.description = description || '';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'type') && typeof type === 'string') {
    updates.type = type;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'seoTitle')) {
    updates.seo_title = seoTitle || '';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'seoDescription')) {
    updates.seo_description = seoDescription || '';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'rules')) {
    updates.rules = Array.isArray(rules) && rules.length > 0 ? JSON.stringify(rules) : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'requiredTools')) {
    updates.required_tools = toStoredRequiredTools(requiredTools);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'sections') || Object.prototype.hasOwnProperty.call(body, 'items')) {
    const normalizedSections = parseSectionsPayload(sections ?? bodyItems);
    if (normalizedSections.error) {
      return refuse(normalizedSections.error, 400);
    }
    incomingSections = normalizedSections.sections;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'is_public') && typeof is_public === 'boolean') {
    updates.is_public = is_public;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'categories') || Object.prototype.hasOwnProperty.call(body, 'category')) {
    const finalCategories = normalizeStringArray(categories ?? category);
    updates.category = JSON.stringify(finalCategories);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    const finalTags = normalizeStringArray(tags);
    updates.tags = JSON.stringify(finalTags);
  }

  if (Object.keys(updates).length === 0 && !incomingSections && !requestedSlug?.trim()) {
    return refuse('No fields to update', 400);
  }

  const existingTemplate = await findTemplateById(db, templateId);

  if (!existingTemplate || !(await canViewTemplate(env, existingTemplate, userId))) {
    return refuse('Template not found or unauthorized', 404);
  }
  if (options.privatePersonalOnly && !isOwnPersonalTemplateRow(existingTemplate, userId)) {
    return refuse('Template not found or unauthorized', 404);
  }
  if (options.privatePersonalOnly && Boolean(existingTemplate.is_public)) {
    return refuse('Public templates can only be edited in SERP Lists', 403, { code: 'template_is_public' });
  }
  if (!(await canEditTemplate(env, existingTemplate, userId))) {
    return refuse('Forbidden', 403);
  }
  if (incomingSections) {
    const previousSections = parseJsonArray(existingTemplate.items) ?? [];
    const stableSections = assignMissingStableTemplateIdentities(incomingSections, previousSections);
    const identityError = validateStableTemplateIdentities(stableSections);
    if (identityError) {
      return refuse(identityError, 400);
    }
    if (templateStructureChanged(previousSections, stableSections)) {
      const tooLarge = contentTooLargeRefusal('template', stableSections, previousSections);
      if (tooLarge) return { refused: tooLarge };
      syncedItems = JSON.stringify(stableSections);
      updates.items = syncedItems;
    }
  }
  const slugRequest = resolveRequestedSlug(requestedSlug, existingTemplate.slug);
  if (slugRequest.kind === 'invalid') return refuse(slugRequest.message, 400);
  const versionRequired = requestsContentChange(body, slugRequest.kind === 'changed');
  if (typeof expected_version === 'number' ? expected_version !== existingTemplate.version : versionRequired) {
    return refuse('Template changed since it was loaded. Refresh before saving again.', 409, {
      code: 'edit_conflict',
      details: { expectedVersion: expected_version, currentVersion: existingTemplate.version },
    });
  }

  const asksForNothing = slugRequest.kind === 'unchanged' && Object.keys(updates).length === 0 && !incomingSections;
  if (asksForNothing) {
    return refuse('No fields to update', 400);
  }
  if (slugRequest.kind === 'changed') {
    const requestedSlugValue = slugRequest.slug;
    const [conflict] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.slug, requestedSlugValue), ne(templates.id, templateId)))
      .limit(1);

    const slugTaken = Boolean(conflict) || isReservedTemplateSlug(requestedSlugValue);
    const slug = slugTaken ? await findFreeSuffixedSlug(db, requestedSlugValue, templateId) : requestedSlugValue;
    if (!slug) return slugInUse(requestedSlugValue);
    updates.slug = slug;
  }

  const changes = omitUnchangedTemplateColumns(existingTemplate, updates);
  const invalidField = validateChangedTemplateFields(changes, parsed.data);
  if (invalidField) {
    return refuse(invalidField.message, 400, { details: invalidField.details });
  }
  const currentVersion = typeof existingTemplate.version === 'number' ? existingTemplate.version : 1;
  const currentContentVersion = typeof existingTemplate.content_version === 'number'
    ? existingTemplate.content_version
    : currentVersion;
  if (Object.keys(changes).length === 0) {
    return {
      saved: {
        success: true,
        id: templateId,
        slug: existingTemplate.slug ?? undefined,
        version: currentVersion,
        content_version: currentContentVersion,
        structureChanged: false,
        reconciledRuns: 0,
      },
    };
  }
  const nextVersion = currentVersion + 1;
  const nextContentVersion = syncedItems === null ? currentContentVersion : currentContentVersion + 1;
  const templateValues: TemplateUpdateValues = { ...changes, version: nextVersion, updated_at: now, updated_by_user_id: userId };
  if (syncedItems !== null) {
    templateValues.content_version = nextContentVersion;
  }

  if (typeof title === 'string' && junkTemplateTitles.has(title)) {
    log('warn', 'junk_template_title_updated', { userId, templateId, title });
  }

  const sameVersionInOwnerScope = existingTemplate.owner_type === 'team' && existingTemplate.team_id
    ? and(eq(templates.id, templateId), eq(templates.team_id, existingTemplate.team_id), eq(templates.version, currentVersion), isNull(templates.deleted_at))
    : and(eq(templates.id, templateId), eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), eq(templates.version, currentVersion), isNull(templates.deleted_at));
  const stillPrivate = or(eq(templates.is_public, false), isNull(templates.is_public));
  const templateWriteGuard = options.privatePersonalOnly
    ? and(sameVersionInOwnerScope, stillPrivate)
    : sameVersionInOwnerScope;

  const subject = getTemplateSubject(existingTemplate, userId);
  const updatedTemplate = {
    ...existingTemplate,
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
    before: existingTemplate,
    after: updatedTemplate,
    diff: changes,
    metadata: visibilityChange || options.auditMetadata ? { ...visibilityChange, ...options.auditMetadata } : undefined,
    request,
    createdAt: now,
  });

  const matchingRuns = syncedItems === null
    ? []
    : await db
        .select()
        .from(checklistRuns)
        .where(
          existingTemplate.owner_type === 'team' && existingTemplate.team_id
            ? and(
                eq(checklistRuns.template_id, templateId),
                eq(checklistRuns.team_id, existingTemplate.team_id),
                eq(checklistRuns.status, 'in_progress'),
                or(eq(checklistRuns.is_public, false), isNull(checklistRuns.is_public)),
                isNull(checklistRuns.deleted_at),
              )
            : and(
                eq(checklistRuns.template_id, templateId),
                eq(checklistRuns.user_id, userId),
                isNull(checklistRuns.team_id),
                eq(checklistRuns.status, 'in_progress'),
                or(eq(checklistRuns.is_public, false), isNull(checklistRuns.is_public)),
                isNull(checklistRuns.deleted_at),
              ),
        )
        .orderBy(checklistRuns.created_at);
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
        eq(checklistRuns.id, run.id),
        eq(checklistRuns.revision, revision),
        eq(checklistRuns.status, 'in_progress'),
        or(eq(checklistRuns.is_public, false), isNull(checklistRuns.is_public)),
        isNull(checklistRuns.deleted_at),
      ),
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
      templateValues,
      templateWriteGuard,
      auditEvent,
      versionValues,
      reconciledRunUpdates,
    );
    if (!updated) return editConflictWhileSaving();
    reconciledRuns = runResults.filter((result) => !batchWriteMissed(result)).length;
  } catch (error) {
    if (isUniqueViolationOn(error, 'template_versions.version')) return editConflictWhileSaving();
    if (isTemplateSlugUniqueViolation(error) && typeof changes.slug === 'string') {
      return slugInUse(changes.slug);
    }
    throw error;
  }

  return {
    saved: {
      success: true,
      id: templateId,
      slug: typeof changes.slug === 'string' ? changes.slug : existingTemplate.slug ?? undefined,
      version: nextVersion,
      content_version: nextContentVersion,
      structureChanged: syncedItems !== null,
      reconciledRuns,
    },
  };
}
