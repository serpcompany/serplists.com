import { getTableColumns, sql } from 'drizzle-orm';
import { schema } from '../db';
import type { AuditSubject } from './audit';

// Helpers shared by the checklist run handlers (private and share-link routes).

export const checklistRunSelect = {
  ...getTableColumns(schema.checklist_runs),
  current_template_version: sql<number | null>`(
    SELECT content_version FROM templates WHERE templates.id = ${schema.checklist_runs.template_id}
  )`,
};

export function serializeChecklistRun(run: Record<string, unknown>) {
  const templateVersion = typeof run.template_version === 'number' ? run.template_version : 1;
  const currentTemplateVersion = typeof run.current_template_version === 'number'
    ? run.current_template_version
    : templateVersion;

  return {
    ...run,
    current_template_version: currentTemplateVersion,
    is_stale: currentTemplateVersion > templateVersion,
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

export function getRunSubject(run: Record<string, unknown>, fallbackUserId: string): AuditSubject {
  if (typeof run.team_id === 'string' && run.team_id) {
    return { type: 'team', id: run.team_id };
  }

  return {
    type: 'user',
    id: typeof run.user_id === 'string' && run.user_id ? run.user_id : fallbackUserId,
  };
}
