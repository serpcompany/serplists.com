import { and, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import { schema, type createDb } from '../db';
import type { AuditSubject } from './audit';
import { insertRowWhere, rowExistsSql } from './guarded-insert';
import { runSourceTemplateUsableSql } from './template-access';

// Helpers shared by the checklist run handlers (private and share-link routes).

// A share token is a write credential for its run (PUT /api/checklists/shared/:token), so run
// reads never return it or its timestamps: a read-only Organization viewer could otherwise
// edit shared runs. Share links come only from the share-creation responses.
const SHARE_SECRET_COLUMNS = ['share_token', 'share_expires_at', 'share_used_at'] as const;

function runResponseColumns() {
  const {
    share_token: _token,
    share_expires_at: _expires,
    share_used_at: _used,
    ...columns
  } = getTableColumns(schema.checklist_runs);
  return columns;
}

/**
 * The source template's current content version, read only when `userId` (null for
 * share-link guests) may still use that template as a run source. Otherwise it is NULL and
 * the run is not stale, so nobody is offered a revalidation that would copy content they
 * cannot see. The lookup stays a primary-key read.
 */
function currentTemplateVersionSql(userId: string | null) {
  return sql<number | null>`(
    SELECT content_version FROM templates
    WHERE templates.id = ${schema.checklist_runs.template_id} AND ${runSourceTemplateUsableSql(userId)}
  )`;
}

/** Run columns plus the source template's current content version for `userId`. */
export function checklistRunSelectFor(userId: string | null) {
  return {
    ...runResponseColumns(),
    current_template_version: currentTemplateVersionSql(userId),
  };
}

function templateVersions(row: Record<string, unknown>) {
  const templateVersion = typeof row.template_version === 'number' ? row.template_version : 1;
  const currentTemplateVersion = typeof row.current_template_version === 'number'
    ? row.current_template_version
    : templateVersion;

  return {
    template_version: templateVersion,
    current_template_version: currentTemplateVersion,
    is_stale: currentTemplateVersion > templateVersion,
  };
}

/** A run for an API response. Drops the share columns even when a caller selected them. */
export function serializeChecklistRun(row: Record<string, unknown>) {
  const run = { ...row };
  for (const column of SHARE_SECRET_COLUMNS) delete run[column];
  const { current_template_version, is_stale } = templateVersions(run);

  return { ...run, current_template_version, is_stale };
}

/**
 * The columns a share-link guest may read: what the share page shows and needs to save
 * (`revision` for expected_revision). Never owner, member, Organization or template ids,
 * notes on retired tasks, or share and archive state: holding a link is not membership.
 */
export function sharedChecklistRunSelect() {
  const { checklist_runs } = schema;
  return {
    id: checklist_runs.id,
    title: checklist_runs.title,
    items: checklist_runs.items,
    status: checklist_runs.status,
    progress: checklist_runs.progress,
    started_at: checklist_runs.started_at,
    completed_at: checklist_runs.completed_at,
    template_version: checklist_runs.template_version,
    revision: checklist_runs.revision,
    current_template_version: currentTemplateVersionSql(null),
  };
}

/** A shared run for a guest, built only from the sharedChecklistRunSelect fields. */
export function serializeSharedChecklistRun(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    items: row.items,
    status: row.status,
    progress: row.progress,
    started_at: row.started_at,
    completed_at: row.completed_at ?? null,
    revision: typeof row.revision === 'number' ? row.revision : 1,
    ...templateVersions(row),
    // Only active shares are served.
    is_public: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** True when a conditional UPDATE in a D1 batch matched no row. */
export function batchUpdateMissed(result: unknown): boolean {
  if (!isRecord(result)) return false;
  const meta = result.meta;
  return isRecord(meta) && typeof meta.changes === 'number' && meta.changes === 0;
}

/**
 * Batch statements for a guarded run write and its audit row, which land together or not at
 * all. The audit row is inserted first, only while run `runId` matches `guard` (the state the
 * write requires: revision, owner scope, archive state); the UPDATE then runs under the same
 * guard. A plain audit INSERT would commit even when the UPDATE lost a race and matched no
 * row. After the batch, `batchUpdateMissed(results[1])` means nothing was written.
 */
export function auditedRunUpdate(
  db: ReturnType<typeof createDb>,
  runId: string,
  guard: SQL | undefined,
  updates: Record<string, unknown>,
  auditEvent: typeof schema.audit_events.$inferInsert,
) {
  const { audit_events, checklist_runs } = schema;
  return [
    insertRowWhere(db, audit_events, auditEvent, rowExistsSql(checklist_runs.id, runId, guard)),
    db.update(checklist_runs).set(updates).where(and(eq(checklist_runs.id, runId), guard)),
  ] as const;
}

export function getRunSubject(run: Record<string, unknown>, fallbackUserId: string): AuditSubject {
  if (typeof run.team_id === 'string' && run.team_id) {
    return { type: 'team', id: run.team_id };
  }

  return {
    type: 'user',
    id: typeof run.user_id === 'string' && run.user_id ? run.user_id : fallbackUserId,
  };
}
