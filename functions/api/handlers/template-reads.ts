import { Env } from '../types';
import { decodeSlugPath } from '../utils/slug';
import { and, desc, eq, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import { schema } from '../db';
import { json, jsonError } from '../utils/response';
import { withEdgeCache } from '../utils/edge-cache';
import {
  parseHistoryLimit,
  selectAuditEventHistory,
  selectTemplateVersionHistory,
  serializeHistoryEvent,
  serializeTemplateVersionHistory,
} from '../utils/history-queries';
import {
  findPublicProfileOwner,
  publicTemplatesOfProfileOwners,
  type PublicProfileOwner,
} from '../utils/public-profile-owner';
import { canViewTeam, getActiveTeamMembership, normalizeTeamRole } from '../utils/team-access';
import { isOwnPersonalTemplateRow, toPublicTemplate } from '../utils/template-public';
import {
  findTemplateById,
  parseTemplateRow,
  selectTemplatesWithOwner,
  withRulesColumnFallback,
  type TemplateDb,
} from '../utils/template-rows';
import {
  canViewPrivateTemplate,
  getTemplateSubject,
  serializeTemplateForViewer,
} from '../utils/template-permissions';

const PUBLIC_CATALOG_CACHE_KEY = '/api/templates?scope=public&fields=public-with-owner-handles';
const PUBLIC_CATALOG_CACHE_SECONDS = 5 * 60;

type ProfileTemplatesOwner = Pick<PublicProfileOwner, 'type' | 'id'>;

function isMissingHistoryReadTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table: (audit_events|template_versions)/i.test(message);
}

async function canListOrganizationTemplates(env: Env, teamId: string, userId: string): Promise<boolean> {
  const membership = await getActiveTeamMembership(env, teamId, userId);
  return membership !== null && canViewTeam(normalizeTeamRole(membership.role));
}

export function selectPublicProfileTemplates(env: Env, owner: ProfileTemplatesOwner, includeRules: boolean) {
  return selectTemplatesWithOwner(env, includeRules)
    .where(publicTemplatesOfProfileOwners(owner.type, [owner.id]))
    .orderBy(desc(schema.templates.created_at));
}

async function findProfileTemplatesOwner(env: Env, url: URL): Promise<ProfileTemplatesOwner | Response> {
  const userId = url.searchParams.get('userId');
  if (userId) return { type: 'user', id: userId };

  const handle = url.searchParams.get('handle')?.trim();
  if (!handle) return jsonError('userId or handle required', 400);
  return (await findPublicProfileOwner(env, handle)) ?? jsonError('Profile not found', 404);
}

async function listPublicProfileTemplates(env: Env, url: URL): Promise<Response> {
  const owner = await findProfileTemplatesOwner(env, url);
  if (owner instanceof Response) return owner;

  const rows = await withRulesColumnFallback((includeRules) => selectPublicProfileTemplates(env, owner, includeRules));
  return json(rows.map((row) => toPublicTemplate(parseTemplateRow(row))));
}

async function readActiveTemplate(env: Env, userId: string | null, matches: SQL): Promise<Response> {
  const { templates } = schema;
  const [template] = await withRulesColumnFallback((includeRules) =>
    selectTemplatesWithOwner(env, includeRules, true)
      .where(and(matches, isNull(templates.deleted_at)))
      .limit(1),
  );

  const body = template ? await serializeTemplateForViewer(env, template, userId) : null;
  return body ? json(body) : jsonError('Template not found', 404);
}

async function listArchivedTemplates(env: Env, url: URL, userId: string | null): Promise<Response> {
  const { templates } = schema;
  if (!userId) {
    return jsonError('Unauthorized', 401);
  }

  const teamId = url.searchParams.get('teamId');
  if (teamId && !(await canListOrganizationTemplates(env, teamId, userId))) {
    return jsonError('Organization not found', 404);
  }
  const ownedByContext = teamId
    ? and(eq(templates.owner_type, 'team'), eq(templates.team_id, teamId))
    : and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id));

  const rows = await withRulesColumnFallback((includeRules) =>
    selectTemplatesWithOwner(env, includeRules)
      .where(and(ownedByContext, isNotNull(templates.deleted_at)))
      .orderBy(desc(templates.updated_at)),
  );

  return json(rows.map((row) => parseTemplateRow(row)));
}

async function readTemplateHistory(
  env: Env,
  db: TemplateDb,
  url: URL,
  userId: string | null,
  templateId: string,
): Promise<Response> {
  if (!userId) {
    return jsonError('Unauthorized', 401);
  }

  const historyLimit = parseHistoryLimit(url.searchParams.get('limit'));
  const template = await findTemplateById(db, templateId);

  if (!template || !(await canViewPrivateTemplate(env, template, userId))) {
    return jsonError('Template not found', 404);
  }
  const subject = getTemplateSubject(template, userId);

  try {
    const [versionRows, eventRows] = await Promise.all([
      selectTemplateVersionHistory(db, templateId, historyLimit),
      selectAuditEventHistory(db, 'template', templateId, historyLimit),
    ]);
    const events = eventRows.map(serializeHistoryEvent);

    return json({
      templateId,
      subject,
      versions: serializeTemplateVersionHistory(versionRows, events),
      events,
    });
  } catch (error) {
    if (isMissingHistoryReadTableError(error)) {
      return json({ templateId, subject, versions: [], events: [] });
    }

    throw error;
  }
}

async function listOrganizationTemplates(env: Env, teamId: string, userId: string | null): Promise<Response> {
  const { templates } = schema;
  if (!userId) return jsonError('Unauthorized', 401);
  if (!(await canListOrganizationTemplates(env, teamId, userId))) {
    return jsonError('Organization not found', 404);
  }

  const rows = await withRulesColumnFallback((includeRules) =>
    selectTemplatesWithOwner(env, includeRules)
      .where(and(eq(templates.owner_type, 'team'), eq(templates.team_id, teamId), isNull(templates.deleted_at)))
      .orderBy(desc(templates.created_at)),
  );

  return json(rows.map((row) => parseTemplateRow(row)));
}

async function listCatalogOrPersonalTemplates(
  request: Request,
  env: Env,
  url: URL,
  userId: string | null,
): Promise<Response> {
  const { templates } = schema;
  const scope = url.searchParams.get('scope');
  if (scope === 'personal' && !userId) return jsonError('Unauthorized', 401);

  const ownPersonalTemplates = userId
    ? and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id))
    : undefined;
  const isPublicCatalog = !ownPersonalTemplates || scope === 'public';
  const listed = isPublicCatalog
    ? eq(templates.is_public, true)
    : scope === 'personal'
      ? ownPersonalTemplates
      : or(eq(templates.is_public, true), ownPersonalTemplates);

  const respond = async () => {
    const rows = await withRulesColumnFallback((includeRules) =>
      selectTemplatesWithOwner(env, includeRules)
        .where(and(listed, isNull(templates.deleted_at)))
        .orderBy(desc(templates.created_at)),
    );
    return json(rows.map((template) =>
      !isPublicCatalog && isOwnPersonalTemplateRow(template, userId)
        ? parseTemplateRow(template)
        : toPublicTemplate(parseTemplateRow(template)),
    ));
  };

  return isPublicCatalog
    ? withEdgeCache(request, PUBLIC_CATALOG_CACHE_KEY, PUBLIC_CATALOG_CACHE_SECONDS, respond)
    : respond();
}

export async function handleTemplateReads(
  request: Request,
  env: Env,
  db: TemplateDb,
  url: URL,
  userId: string | null,
  templatesSubpath: string[],
): Promise<Response> {
  const { templates } = schema;
  const [first, second] = templatesSubpath;

  if (first === 'public') {
    return listPublicProfileTemplates(env, url);
  }

  if (first === 'slug' && second) {
    const slug = decodeSlugPath(templatesSubpath.slice(1));
    if (!slug) return jsonError('Template not found', 404);
    return readActiveTemplate(env, userId, eq(templates.slug, slug));
  }

  if (first === 'archived') {
    return listArchivedTemplates(env, url, userId);
  }

  if (first && second === 'history') {
    return readTemplateHistory(env, db, url, userId, first);
  }

  if (first) {
    return readActiveTemplate(env, userId, eq(templates.id, first));
  }

  const teamId = url.searchParams.get('teamId');
  if (teamId) {
    return listOrganizationTemplates(env, teamId, userId);
  }

  return listCatalogOrPersonalTemplates(request, env, url, userId);
}
