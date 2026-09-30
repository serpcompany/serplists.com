import { Env } from '../types';
import { decodeSlugPath } from '../utils/slug';
import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
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
import { canViewTeam, getActiveTeamMembership, normalizeTeamRole } from '../utils/team-access';
import { isOwnPersonalTemplateRow, toPublicTemplate } from '../utils/template-public';
import {
  getTemplateSelectColumns,
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

function isMissingHistoryReadTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table: (audit_events|template_versions)/i.test(message);
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
