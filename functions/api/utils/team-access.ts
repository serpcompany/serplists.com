import { and, eq, exists, inArray, isNotNull, isNull } from "drizzle-orm";
import { alias, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import { createDb, schema } from "../db";
import type { Env } from "../types";

export const teamRoles = ["owner", "admin", "editor", "runner", "viewer"] as const;
export type TeamRole = (typeof teamRoles)[number];

export type TeamMembership = typeof schema.teamMembers.$inferSelect;

const roleRank: Record<TeamRole, number> = {
  owner: 50,
  admin: 40,
  editor: 30,
  runner: 20,
  viewer: 10,
};

function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (teamRoles as readonly string[]).includes(value);
}

export function normalizeTeamRole(value: unknown, fallback: TeamRole = "viewer"): TeamRole {
  return isTeamRole(value) ? value : fallback;
}

function hasTeamRole(role: TeamRole, minimumRole: TeamRole): boolean {
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

export async function findActiveTeam(db: ReturnType<typeof createDb>, teamId: string) {
  const { teams } = schema;
  const [team] = await db.select().from(teams).where(and(eq(teams.id, teamId), isNull(teams.archived_at))).limit(1);
  return team;
}

export async function getActiveTeamMembership(
  env: Env,
  teamId: string,
  userId: string,
): Promise<TeamMembership | null> {
  const db = createDb(env);
  const { teamMembers, teams } = schema;

  const [membership] = await db
    .select({
      id: teamMembers.id,
      team_id: teamMembers.team_id,
      user_id: teamMembers.user_id,
      role: teamMembers.role,
      status: teamMembers.status,
      invited_by_user_id: teamMembers.invited_by_user_id,
      joined_at: teamMembers.joined_at,
      created_at: teamMembers.created_at,
      updated_at: teamMembers.updated_at,
    })
    .from(teamMembers)
    .leftJoin(teams, eq(teams.id, teamMembers.team_id))
    .where(
      and(
        eq(teamMembers.team_id, teamId),
        eq(teamMembers.user_id, userId),
        eq(teamMembers.status, "active"),
        isNotNull(teams.id),
        isNull(teams.archived_at),
      ),
    )
    .limit(1);

  return membership ?? null;
}

export function activeTeamMemberExists(
  db: ReturnType<typeof createDb>,
  teamId: SQLiteColumn | string,
  userId: SQLiteColumn | string,
  roles?: readonly TeamRole[],
) {
  const member = alias(schema.teamMembers, roles ? "active_manager" : "active_member");
  return exists(
    db.select({ id: member.id }).from(member).where(
      and(
        eq(member.team_id, teamId),
        eq(member.user_id, userId),
        eq(member.status, "active"),
        roles ? inArray(member.role, [...roles]) : undefined,
      ),
    ),
  );
}

export function activeTeamManagerExists(
  db: ReturnType<typeof createDb>,
  teamId: SQLiteColumn | string,
  userId: SQLiteColumn | string,
) {
  return activeTeamMemberExists(db, teamId, userId, ["owner", "admin"]);
}
