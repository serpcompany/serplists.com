import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { createDb, schema } from "../db";
import type { Env } from "../types";

export const teamRoles = ["owner", "admin", "editor", "runner", "viewer"] as const;
export type TeamRole = (typeof teamRoles)[number];

export type TeamMembership = typeof schema.team_members.$inferSelect;

const roleRank: Record<TeamRole, number> = {
  owner: 50,
  admin: 40,
  editor: 30,
  runner: 20,
  viewer: 10,
};

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (teamRoles as readonly string[]).includes(value);
}

export function normalizeTeamRole(value: unknown, fallback: TeamRole = "viewer"): TeamRole {
  return isTeamRole(value) ? value : fallback;
}

export function hasTeamRole(role: TeamRole, minimumRole: TeamRole): boolean {
  return roleRank[role] >= roleRank[minimumRole];
}

export function canViewTeam(role: TeamRole): boolean {
  return hasTeamRole(role, "viewer");
}

export function canRunTeamTemplates(role: TeamRole): boolean {
  return hasTeamRole(role, "runner");
}

export function canEditTeamTemplates(role: TeamRole): boolean {
  return hasTeamRole(role, "editor");
}

export function canManageTeam(role: TeamRole): boolean {
  return hasTeamRole(role, "admin");
}

export async function getActiveTeamMembership(
  env: Env,
  teamId: string,
  userId: string,
): Promise<TeamMembership | null> {
  const db = createDb(env);
  const { team_members, teams } = schema;

  const [membership] = await db
    .select({
      id: team_members.id,
      team_id: team_members.team_id,
      user_id: team_members.user_id,
      role: team_members.role,
      status: team_members.status,
      invited_by_user_id: team_members.invited_by_user_id,
      joined_at: team_members.joined_at,
      created_at: team_members.created_at,
      updated_at: team_members.updated_at,
    })
    .from(team_members)
    .leftJoin(teams, eq(teams.id, team_members.team_id))
    .where(
      and(
        eq(team_members.team_id, teamId),
        eq(team_members.user_id, userId),
        eq(team_members.status, "active"),
        isNotNull(teams.id),
        isNull(teams.archived_at),
      ),
    )
    .limit(1);

  return membership ?? null;
}

export async function userHasTeamRole(
  env: Env,
  teamId: string,
  userId: string,
  minimumRole: TeamRole,
): Promise<{ allowed: boolean; membership: TeamMembership | null; role: TeamRole | null }> {
  const membership = await getActiveTeamMembership(env, teamId, userId);
  const role = membership ? normalizeTeamRole(membership.role) : null;

  return {
    allowed: role ? hasTeamRole(role, minimumRole) : false,
    membership,
    role,
  };
}
