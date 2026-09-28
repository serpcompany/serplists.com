import { sql, type SQL } from 'drizzle-orm';
import { schema } from '../db';

// Which templates may supply content to a run. Run creation, template sharing, revalidation,
// and the run staleness flag all use this one rule, so Personal and private Organization
// content never reaches a run its owner did not allow:
//   - archived templates never;
//   - public templates always;
//   - Organization templates only for runs of that same Organization (not a member's
//     Personal run, not another Organization's run);
//   - Personal templates only for their owner (in the owner's Personal or Organization runs).
// Organization membership and role are checked separately, against the run.

export type RunSourceTemplate = {
  deleted_at?: string | null;
  is_public?: boolean | number | null;
  owner_type?: string | null;
  team_id?: string | null;
  user_id?: string | null;
};

export function canUseTemplateAsRunSource(
  template: RunSourceTemplate,
  context: { userId: string | null; runTeamId: string | null },
): boolean {
  if (typeof template.deleted_at === 'string' && template.deleted_at) return false;
  if (template.is_public === true || template.is_public === 1) return true;
  if (template.owner_type === 'team' && typeof template.team_id === 'string' && template.team_id) {
    return template.team_id === context.runTeamId;
  }

  return context.userId !== null && template.user_id === context.userId;
}

/**
 * canUseTemplateAsRunSource as a SQL condition on `templates` for a subquery correlated with
 * `checklist_runs`. `userId` is the caller (null for share-link guests).
 */
export function runSourceTemplateUsableSql(userId: string | null): SQL {
  const { checklist_runs, templates } = schema;
  return sql`${templates.deleted_at} IS NULL AND (
    ${templates.is_public} = 1
    OR (${templates.owner_type} = 'team' AND ${templates.team_id} <> '' AND ${templates.team_id} = ${checklist_runs.team_id})
    OR ((${templates.owner_type} <> 'team' OR ${templates.team_id} IS NULL OR ${templates.team_id} = '') AND ${templates.user_id} = ${userId})
  )`;
}
