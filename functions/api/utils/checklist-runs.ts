import { and, eq, getTableColumns, isNull, sql, type SQL } from 'drizzle-orm';
import { schema, type createDb } from '../db';
import type { Env } from '../types';
import type { AuditSubject } from './audit';
import { insertRowWhere, rowExistsSql } from './guarded-insert';
import { jsonError } from './response';
import { canUpdateRun, canViewRun } from './run-access';
import { runSourceTemplateUsableSql } from './template-access';

const SHARE_SECRET_COLUMNS = ['share_token', 'share_expires_at', 'share_used_at'] as const;

type RunRow = typeof schema.checklistRuns.$inferSelect;
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
    share_token,
    share_expires_at,
    share_used_at,
    ...columns
  } = getTableColumns(schema.checklistRuns);
  return columns;
}

function currentTemplateVersionSql(callerUserId: string | null) {
  return sql<number | null>`(
    SELECT content_version FROM templates
    WHERE templates.id = ${schema.checklistRuns.template_id} AND ${runSourceTemplateUsableSql(callerUserId)}
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
  const { checklistRuns } = schema;
  return {
    id: checklistRuns.id,
    title: checklistRuns.title,
    items: checklistRuns.items,
    status: checklistRuns.status,
    progress: checklistRuns.progress,
    started_at: checklistRuns.started_at,
    completed_at: checklistRuns.completed_at,
    template_version: checklistRuns.template_version,
    revision: checklistRuns.revision,
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

export async function findRunToUpdate(
  env: Env,
  db: ReturnType<typeof createDb>,
  runId: string,
  userId: string,
  notFoundMessage: string,
): Promise<{ run: RunRow } | { response: Response }> {
  const { checklistRuns } = schema;
  const [run] = await db
    .select()
    .from(checklistRuns)
    .where(and(eq(checklistRuns.id, runId), isNull(checklistRuns.deleted_at)))
    .limit(1);

  if (!run || !(await canViewRun(env, run, userId))) {
    return { response: jsonError(notFoundMessage, 404) };
  }
  if (!(await canUpdateRun(env, run, userId))) {
    return { response: jsonError('Forbidden', 403) };
  }
  return { run };
}

export function auditedRunUpdate(
  db: ReturnType<typeof createDb>,
  runId: string,
  guard: SQL | undefined,
  updates: Record<string, unknown>,
  auditEvent: typeof schema.auditEvents.$inferInsert,
) {
  const { auditEvents, checklistRuns } = schema;
  return [
    insertRowWhere(db, auditEvents, auditEvent, rowExistsSql(checklistRuns.id, runId, guard)),
    db.update(checklistRuns).set(updates).where(and(eq(checklistRuns.id, runId), guard)),
  ] as const;
}

export function getRunSubject(run: Pick<RunRow, 'team_id' | 'user_id'>, fallbackUserId: string): AuditSubject {
  if (run.team_id) {
    return { type: 'team', id: run.team_id };
  }

  return { type: 'user', id: run.user_id || fallbackUserId };
}
