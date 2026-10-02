import type { Env } from '../types';
import { canManageTeam, canRunTeamTemplates, canViewTeam, getActiveTeamMembership, normalizeTeamRole } from './team-access';

type RunRecord = Record<string, unknown>;

const isArchived = (run: RunRecord) => typeof run.deleted_at === 'string' && Boolean(run.deleted_at);

async function hasRunRole(env: Env, run: RunRecord, userId: string, allowed: (role: ReturnType<typeof normalizeTeamRole>) => boolean) {
  if (typeof run.team_id === 'string' && run.team_id) {
    const membership = await getActiveTeamMembership(env, run.team_id, userId);
    return membership ? allowed(normalizeTeamRole(membership.role)) : false;
  }

  return run.user_id === userId;
}

export async function canViewRun(env: Env, run: RunRecord, userId: string): Promise<boolean> {
  return !isArchived(run) && hasRunRole(env, run, userId, canViewTeam);
}

export async function canViewRunHistory(env: Env, run: RunRecord, userId: string): Promise<boolean> {
  return hasRunRole(env, run, userId, canViewTeam);
}

export async function canUpdateRun(env: Env, run: RunRecord, userId: string): Promise<boolean> {
  return !isArchived(run) && hasRunRole(env, run, userId, canRunTeamTemplates);
}

export async function canDeleteRun(env: Env, run: RunRecord, userId: string): Promise<boolean> {
  return !isArchived(run) && hasRunRole(env, run, userId, canManageTeam);
}

export async function canRestoreRun(env: Env, run: RunRecord, userId: string): Promise<boolean> {
  return hasRunRole(env, run, userId, canManageTeam);
}
