import { and, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type createDb } from '../db';
import type { AuditSubject } from './audit';
import { insertRowWhere, rowExistsSql } from './guarded-insert';
import { runSourceTemplateUsableSql } from './template-access';

const SHARE_SECRET_COLUMNS = ['share_token', 'share_expires_at', 'share_used_at'] as const;

type RunRow = typeof schema.checklist_runs.$inferSelect;
export type RunUpdates = Partial<RunRow>;
type ShareSecretColumn = (typeof SHARE_SECRET_COLUMNS)[number];
type TemplateVersionFields = { template_version: number; current_template_version: number | null };
export type RunResponseRow = Omit<RunRow, ShareSecretColumn> & TemplateVersionFields;
export type SharedRunRow = Pick<
  RunRow,
  'id' | 'title' | 'items' | 'status' | 'progress' | 'started_at' | 'completed_at' | 'revision'
> & TemplateVersionFields;

function runResponseColumns() {
  const {
    share_token: _token,
    share_expires_at: _expires,
    share_used_at: _used,
    ...columns
  } = getTableColumns(schema.checklist_runs);
  return columns;
}

function currentTemplateVersionSql(callerUserId: string | null) {
  return sql<number | null>`(
    SELECT content_version FROM templates
    WHERE templates.id = ${schema.checklist_runs.template_id} AND ${runSourceTemplateUsableSql(callerUserId)}
  )`;
}

export function checklistRunSelectFor(callerUserId: string | null) {
  return {
    ...runResponseColumns(),
    current_template_version: currentTemplateVersionSql(callerUserId),
  };
}

function templateVersions(row: TemplateVersionFields) {
  const templateVersion = row.template_version;
  const currentTemplateVersion = row.current_template_version ?? templateVersion;

  return {
    template_version: templateVersion,
    current_template_version: currentTemplateVersion,
    is_stale: currentTemplateVersion > templateVersion,
  };
}

export function serializeChecklistRun(row: RunResponseRow) {
  const run: RunResponseRow & Partial<Record<ShareSecretColumn, unknown>> = { ...row };
  for (const column of SHARE_SECRET_COLUMNS) delete run[column];
  const { current_template_version, is_stale } = templateVersions(run);

  return { ...run, current_template_version, is_stale };
}

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

export function serializeSharedChecklistRun(row: SharedRunRow) {
  return {
    id: row.id,
    title: row.title,
    items: row.items,
    status: row.status,
    progress: row.progress,
    started_at: row.started_at,
    completed_at: row.completed_at ?? null,
    revision: row.revision,
    ...templateVersions(row),
    is_public: true,
  };
}

const batchResultSchema = z.object({ meta: z.object({ changes: z.number() }) });

export function batchChanges(result: unknown): number | null {
  const parsed = batchResultSchema.safeParse(result);
  return parsed.success ? parsed.data.meta.changes : null;
}

export function batchUpdateMissed(result: unknown): boolean {
  return batchChanges(result) === 0;
}

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

export function getRunSubject(run: Pick<RunRow, 'team_id' | 'user_id'>, fallbackUserId: string): AuditSubject {
  if (run.team_id) {
    return { type: 'team', id: run.team_id };
  }

  return { type: 'user', id: run.user_id || fallbackUserId };
}
