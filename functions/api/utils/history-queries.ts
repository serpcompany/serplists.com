import { and, desc, eq } from 'drizzle-orm';
import { createDb, schema } from '../db';

type Db = ReturnType<typeof createDb>;

export function selectTemplateVersionHistory(db: Db, templateId: string, limit: number) {
  const { template_versions, users } = schema;

  return db
    .select({
      id: template_versions.id,
      version: template_versions.version,
      changed_by_user_id: template_versions.changed_by_user_id,
      content_hash: template_versions.content_hash,
      change_summary: template_versions.change_summary,
      created_at: template_versions.created_at,
      actor_email: users.email,
      actor_name: users.name,
      actor_username: users.username,
    })
    .from(template_versions)
    .leftJoin(users, eq(users.id, template_versions.changed_by_user_id))
    .where(eq(template_versions.template_id, templateId))
    .orderBy(desc(template_versions.version))
    .limit(limit);
}

export function selectAuditEventHistory(db: Db, resourceType: 'template' | 'checklist_run', resourceId: string, limit: number) {
  const { audit_events, users } = schema;

  return db
    .select({
      id: audit_events.id,
      actor_user_id: audit_events.actor_user_id,
      action: audit_events.action,
      metadata_json: audit_events.metadata_json,
      request_id: audit_events.request_id,
      created_at: audit_events.created_at,
      actor_email: users.email,
      actor_name: users.name,
      actor_username: users.username,
    })
    .from(audit_events)
    .leftJoin(users, eq(users.id, audit_events.actor_user_id))
    .where(and(eq(audit_events.resource_type, resourceType), eq(audit_events.resource_id, resourceId)))
    .orderBy(desc(audit_events.created_at))
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
const HISTORY_LIMIT_MAX = 100;

export function parseHistoryLimit(value: string | null): number {
  const requested = value?.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), HISTORY_LIMIT_MAX)
    : HISTORY_LIMIT_DEFAULT;
}
