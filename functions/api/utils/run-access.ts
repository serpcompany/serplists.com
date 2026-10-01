import type { schema } from '../db';
import type { Env } from '../types';
import { canManageTeam, canRunTeamTemplates, canViewTeam, getActiveTeamMembership, normalizeTeamRole } from './team-access';

export type RunAccessFields = Pick<typeof schema.checklist_runs.$inferSelect, 'deleted_at' | 'team_id' | 'user_id'>;

const isArchived = (run: Pick<RunAccessFields, 'deleted_at'>) => Boolean(run.deleted_at);

async function hasRunRole(
  env: Env,
  run: RunAccessFields,
  userId: string,
  allowed: (role: ReturnType<typeof normalizeTeamRole>) => boolean,
) {
  if (run.team_id) {
    const membership = await getActiveTeamMembership(env, run.team_id, userId);
    return membership ? allowed(normalizeTeamRole(membership.role)) : false;
  }

  return run.user_id === userId;
}

export async function canViewRun(env: Env, run: RunAccessFields, userId: string): Promise<boolean> {
  return !isArchived(run) && hasRunRole(env, run, userId, canViewTeam);
}

export async function canViewRunHistory(env: Env, run: RunAccessFields, userId: string): Promise<boolean> {
  return hasRunRole(env, run, userId, canViewTeam);
}

export async function canUpdateRun(env: Env, run: RunAccessFields, userId: string): Promise<boolean> {
  return !isArchived(run) && hasRunRole(env, run, userId, canRunTeamTemplates);
}

export async function canDeleteRun(env: Env, run: RunAccessFields, userId: string): Promise<boolean> {
  return !isArchived(run) && hasRunRole(env, run, userId, canManageTeam);
}

export async function canRestoreRun(env: Env, run: RunAccessFields, userId: string): Promise<boolean> {
  return hasRunRole(env, run, userId, canManageTeam);
}
