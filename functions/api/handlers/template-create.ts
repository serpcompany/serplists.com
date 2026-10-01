import { Env } from '../types';
import { createDb } from '../db';
import {
  describePayloadError,
  getRequestedTeamId,
  normalizeStringArray,
  parseSectionsPayload,
  templatePayloadSchema,
} from '../utils/payloads';
import { jsonError } from '../utils/response';
import { log } from '../utils/logger';
import { getEntitlementsForContext, getEntitlementsForUser } from '../utils/entitlements';
import {
  buildAuditEventValues,
  buildTemplateVersionValues,
  type AuditSubject,
} from '../utils/audit';
import {
  countTemplates,
  templateLimitResponse,
  type TemplateInsertValues,
} from '../utils/template-writes';
import { contentTooLargeResponse } from '../utils/content-limits';
import {
  assignMissingStableTemplateIdentities,
  validateStableTemplateIdentities,
} from '../utils/template-reconciliation';
import {
  generateUniqueSlug,
  insertTemplateWithUniqueSlug,
  newTemplateResponse,
  type NewTemplateRows,
} from '../utils/template-insert';
import { assertTeamTemplateCreateAccess } from '../utils/template-permissions';

export const junkTemplateTitles = new Set(['Test Template', 'Updated Template Title']);

export type TemplateWriteOptions = {
  privatePersonalOnly?: boolean;
  auditMetadata?: Record<string, unknown>;
};

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

  const requestedTeamId = options.privatePersonalOnly ? null : getRequestedTeamId(parsed.data, new URL(request.url));
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
