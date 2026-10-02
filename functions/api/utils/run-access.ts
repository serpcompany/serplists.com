import type { schema } from '../db';
import type { Env } from '../types';
import { ownerGrants } from './owner-access';
import { canManageTeam, canRunTeamTemplates, canViewTeam } from './team-access';

export type RunAccessFields = Pick<typeof schema.checklistRuns.$inferSelect, 'deleted_at' | 'team_id' | 'user_id'>;

const isArchived = (run: Pick<RunAccessFields, 'deleted_at'>) => Boolean(run.deleted_at);

export async function canViewRun(env: Env, run: RunAccessFields, userId: string): Promise<boolean> {
  return !isArchived(run) && ownerGrants(env, run, userId, canViewTeam);
}

export async function canViewRunHistory(env: Env, run: RunAccessFields, userId: string): Promise<boolean> {
  return ownerGrants(env, run, userId, canViewTeam);
}

export async function canUpdateRun(env: Env, run: RunAccessFields, userId: string): Promise<boolean> {
  return !isArchived(run) && ownerGrants(env, run, userId, canRunTeamTemplates);
}

export async function canDeleteRun(env: Env, run: RunAccessFields, userId: string): Promise<boolean> {
  return !isArchived(run) && ownerGrants(env, run, userId, canManageTeam);
}

export async function canRestoreRun(env: Env, run: RunAccessFields, userId: string): Promise<boolean> {
  return ownerGrants(env, run, userId, canManageTeam);
}
