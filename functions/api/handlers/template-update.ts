import { Env } from '../types';
import { resolveRequestedSlug } from '../utils/slug';
import { isReservedTemplateSlug } from '../utils/reserved-template-slugs';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { createDb, schema } from '../db';
import {
  describePayloadError,
  normalizeStringArray,
  parseJsonArray,
  parseSectionsPayload,
  templateUpdatePayloadSchema,
} from '../utils/payloads';
import { json, jsonError } from '../utils/response';
import { log } from '../utils/logger';
import { buildAuditEventValues, buildTemplateVersionValues } from '../utils/audit';
import {
  updateTemplateWithHistoryFallback,
  type ReconciledRunUpdate,
  type TemplateUpdateValues,
} from '../utils/template-writes';
import { batchUpdateMissed } from '../utils/checklist-runs';
import { contentFits, contentTooLargeResponse } from '../utils/content-limits';
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
import { isOwnPersonalTemplateRow } from '../utils/template-public';
import { getTemplateSelectColumns, withRulesColumnFallback } from '../utils/template-rows';
import { canEditTemplate, canViewTemplate, getTemplateSubject } from '../utils/template-permissions';
import { junkTemplateTitles, type TemplateWriteOptions } from './template-create';

function slugInUseResponse(slug: string): Response {
  return jsonError('Another template uses this URL slug. Choose a different slug.', 409, { code: 'slug_taken', details: { slug } });
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
