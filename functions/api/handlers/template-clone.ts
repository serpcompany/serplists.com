import { Env } from '../types';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '../db';
import { normalizeSectionsPayload } from '../utils/payloads';
import { jsonError } from '../utils/response';
import { getEntitlementsForContext, getEntitlementsForUser } from '../utils/entitlements';
import {
  buildAuditEventValues,
  buildTemplateVersionValues,
  type AuditSubject,
} from '../utils/audit';
import { personalProRequiredResponse } from '../utils/limit-reached';
import {
  countTemplates,
  templateLimitResponse,
  type TemplateInsertValues,
} from '../utils/template-writes';
import { contentTooLargeResponse } from '../utils/content-limits';
import { isRecord, withStableItemsColumn } from '../utils/template-identities';
import {
  generateUniqueSlug,
  insertTemplateWithUniqueSlug,
  newTemplateResponse,
  type NewTemplateRows,
} from '../utils/template-insert';
import { getTemplateSelectColumns, withRulesColumnFallback, type TemplateDb } from '../utils/template-rows';
import { assertTeamTemplateCreateAccess } from '../utils/template-permissions';

export async function cloneTemplate(
  request: Request,
  env: Env,
  db: TemplateDb,
  userId: string,
  sourceId: string,
): Promise<Response> {
  const { templates } = schema;

  let visibility: 'preserve' | 'public' | 'private' = 'private';
  let cloneTeamId: string | null = null;
  const optionalBody: unknown = await request.json().catch(() => null);
  if (isRecord(optionalBody)) {
    if (optionalBody.visibility === 'preserve' || optionalBody.visibility === 'public' || optionalBody.visibility === 'private') {
      visibility = optionalBody.visibility;
    }
    if (typeof optionalBody.teamId === 'string' && optionalBody.teamId.trim()) {
      cloneTeamId = optionalBody.teamId.trim();
    } else if (typeof optionalBody.team_id === 'string' && optionalBody.team_id.trim()) {
      cloneTeamId = optionalBody.team_id.trim();
    }
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
      items: withStableItemsColumn(source.items),
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
