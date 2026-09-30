import { and, desc, eq } from 'drizzle-orm';
import { createDb, schema } from '../db';

// History lists for the template and run Changelog cards. Both read only LIMIT rows from an
// index in sort order (see docs/design-docs/d1-cost.md); tests/unit/functions/api/
// history-query-plan.test.ts checks the plans against the migrated schema.

type Db = ReturnType<typeof createDb>;

/**
 * A template's newest versions. Versions increase per template, so ordering by version walks
 * the unique (template_id, version) index backwards and stops at LIMIT; ordering by
 * created_at would read and sort every version first.
 */
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

/**
 * A resource's newest audit events. diff_json is left out: a template or run update diff
 * holds the whole template or run, and no history list renders it.
 */
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

/** The API shape of one history event. Metadata is kept: it carries the Run Key (MCP) actor. */
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

// A versioned write records its audit event in the same batch, with the same action and time.
const writeKey = (action: string, createdAt: string) => `${action}|${createdAt}`;

/**
 * The API shape of a template's versions. Each carries the metadata of the audit event its
 * write recorded, the field run history events carry, so the Changelog names the Run Key
 * behind an Agent's edit and labels a Share. The event is looked up in `events`, the newest
 * events read with the same limit, which hold the event of every version the Changelog shows;
 * an older version, or one written before audit events, gets null.
 */
export function serializeTemplateVersionHistory(
  rows: TemplateVersionHistoryRow[],
  events: ReturnType<typeof serializeHistoryEvent>[],
) {
  const metadataByWrite = new Map(events.map((event) => [writeKey(event.action, event.createdAt), event.metadata]));
  return rows.map((row) => {
    const action = row.change_summary ?? 'template.versioned';
    return {
      id: row.id,
      version: row.version,
      action,
      contentHash: row.content_hash,
      createdAt: row.created_at,
      metadata: metadataByWrite.get(writeKey(action, row.created_at)) ?? null,
      actor: {
        userId: row.changed_by_user_id,
        email: row.actor_email,
        name: row.actor_name,
        username: row.actor_username,
      },
    };
  });
}

/** `?limit=` for history lists: 1..100, defaulting to 50 when missing, empty, or not a number. */
export function parseHistoryLimit(value: string | null): number {
  const requested = value?.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 100) : 50;
}
