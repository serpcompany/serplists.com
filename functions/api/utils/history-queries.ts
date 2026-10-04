import { and, desc, eq } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { HISTORY_FULL_LIMIT } from '../../../src/lib/schemas/historyLimits';

type Db = ReturnType<typeof createDb>;

export function selectTemplateVersionHistory(db: Db, templateId: string, limit: number) {
  const { templateVersions, users } = schema;

  return db
    .select({
      id: templateVersions.id,
      version: templateVersions.version,
      changed_by_user_id: templateVersions.changed_by_user_id,
      content_hash: templateVersions.content_hash,
      change_summary: templateVersions.change_summary,
      created_at: templateVersions.created_at,
      actor_email: users.email,
      actor_name: users.name,
      actor_username: users.username,
    })
    .from(templateVersions)
    .leftJoin(users, eq(users.id, templateVersions.changed_by_user_id))
    .where(eq(templateVersions.template_id, templateId))
    .orderBy(desc(templateVersions.version))
    .limit(limit);
}

export function selectAuditEventHistory(db: Db, resourceType: 'template' | 'checklist_run', resourceId: string, limit: number) {
  const { auditEvents, users } = schema;

  return db
    .select({
      id: auditEvents.id,
      actor_user_id: auditEvents.actor_user_id,
      action: auditEvents.action,
      metadata_json: auditEvents.metadata_json,
      request_id: auditEvents.request_id,
      created_at: auditEvents.created_at,
      actor_email: users.email,
      actor_name: users.name,
      actor_username: users.username,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actor_user_id))
    .where(and(eq(auditEvents.resource_type, resourceType), eq(auditEvents.resource_id, resourceId)))
    .orderBy(desc(auditEvents.created_at))
    .limit(limit);
}

type AuditEventHistoryRow = Awaited<ReturnType<typeof selectAuditEventHistory>>[number];
type TemplateVersionHistoryRow = Awaited<ReturnType<typeof selectTemplateVersionHistory>>[number];

function parseMetadata(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function serializeHistoryEvent(row: AuditEventHistoryRow) {
  return {
    id: row.id,
    action: row.action,
    createdAt: row.created_at,
    requestId: row.request_id,
    metadata: parseMetadata(row.metadata_json),
    actor: {
      userId: row.actor_user_id,
      email: row.actor_email,
      name: row.actor_name,
      username: row.actor_username,
    },
  };
}

const versionedWriteKey = (action: string, createdAt: string) => `${action}|${createdAt}`;

export function serializeTemplateVersionHistory(
  rows: TemplateVersionHistoryRow[],
  events: ReturnType<typeof serializeHistoryEvent>[],
) {
  const metadataByWrite = new Map(events.map((event) => [versionedWriteKey(event.action, event.createdAt), event.metadata]));
  return rows.map((row) => {
    const action = row.change_summary ?? 'template.versioned';
    return {
      id: row.id,
      version: row.version,
      action,
      contentHash: row.content_hash,
      createdAt: row.created_at,
      metadata: metadataByWrite.get(versionedWriteKey(action, row.created_at)) ?? null,
      actor: {
        userId: row.changed_by_user_id,
        email: row.actor_email,
        name: row.actor_name,
        username: row.actor_username,
      },
    };
  });
}

const HISTORY_LIMIT_DEFAULT = 50;

export function parseHistoryLimit(value: string | null): number {
  const requested = value?.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), HISTORY_FULL_LIMIT)
    : HISTORY_LIMIT_DEFAULT;
}
