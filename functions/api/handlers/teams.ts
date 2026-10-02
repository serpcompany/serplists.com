import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { getSessionUserId } from "../utils/session";
import { canManageTeam, findActiveTeam, getActiveTeamMembership, normalizeTeamRole } from "../utils/team-access";
import { json, jsonError } from "../utils/response";
import { readJsonOrNull } from "../utils/request-json";
import { reissueTeamInviteLink } from "./team-invite-links";
import { declineTeamInvite, findInviteByToken, leaveTeam, previewTeamInvite } from "./team-self-service";
import { createTeam } from "./team-create";
import { transferTeamOwnership, updateTeamMember } from "./team-membership";
import { acceptTeamInviteRecord, listIncomingTeamInvites } from "./team-invite-accept";
import { createTeamInvite, listTeamInvites, revokeTeamInvite } from "./team-invites";
import { listTeamActivity, listTeamMembers, updateTeamSettings } from "./team-settings";

export async function handleTeams(request: Request, env: Env): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const teamsSubpath = pathParts.slice(2);
  const db = createDb(env);
  const { team_invites, team_members, teams } = schema;

  if (request.method === "GET" && teamsSubpath.length === 0) {
    const rows = await db
      .select({
        id: teams.id,
        name: teams.name,
        slug: teams.slug,
        billing_owner_user_id: teams.billing_owner_user_id,
        created_by_user_id: teams.created_by_user_id,
        created_at: teams.created_at,
        updated_at: teams.updated_at,
        archived_at: teams.archived_at,
        memberId: team_members.id,
        role: team_members.role,
        membershipStatus: team_members.status,
        joined_at: team_members.joined_at,
      })
      .from(team_members)
      .leftJoin(teams, eq(teams.id, team_members.team_id))
      .where(
        and(
          eq(team_members.user_id, userId),
          eq(team_members.status, "active"),
          isNotNull(teams.id),
          isNull(teams.archived_at),
        ),
      )
      .orderBy(desc(team_members.updated_at));

    return json(rows);
  }

  if (request.method === "POST" && teamsSubpath.length === 0) {
    return createTeam({ db, request, userId }, await readJsonOrNull(request));
  }

  if (request.method === "POST" && teamsSubpath[0] === "invites" && teamsSubpath[2] === "accept") {
    const token = teamsSubpath[1];
    if (!token) {
      return jsonError("Invite token required", 400);
    }

    const found = await findInviteByToken(db, token);
    if ("response" in found) {
      return found.response;
    }

    const { invite } = found;
    if (!invite) {
      return jsonError("Invite not found", 404);
    }

    return acceptTeamInviteRecord({ db, env, invite, request, userId });
  }

  if (request.method === "GET" && teamsSubpath[0] === "invites" && teamsSubpath[1] === "pending" && teamsSubpath.length === 2) {
    return listIncomingTeamInvites({ db, env, userId });
  }

  if (teamsSubpath[0] === "invites" && teamsSubpath[1] && teamsSubpath[1] !== "pending") {
    if (request.method === "GET" && teamsSubpath.length === 2) {
      return previewTeamInvite({ db, env, token: teamsSubpath[1], userId });
    }
    if (request.method === "POST" && teamsSubpath.length === 3 && teamsSubpath[2] === "decline") {
      return declineTeamInvite({ db, env, request, token: teamsSubpath[1], userId });
    }
  }

  if (request.method === "POST" && teamsSubpath[0] === "invites" && teamsSubpath[1] === "pending" && teamsSubpath[3] === "accept") {
    const inviteId = teamsSubpath[2];
    if (!inviteId) {
      return jsonError("Invite id required", 400);
    }

    const [invite] = await db.select().from(team_invites).where(eq(team_invites.id, inviteId)).limit(1);
    if (!invite) {
      return jsonError("Invite not found", 404);
    }

    return acceptTeamInviteRecord({ db, env, invite, request, userId });
  }

  const teamId = teamsSubpath[0];
  if (!teamId) {
    return jsonError("Not Found", 404);
  }

  const membership = await getActiveTeamMembership(env, teamId, userId);
  if (!membership || !membership.id) {
    return jsonError("Organization not found", 404);
  }

  const role = normalizeTeamRole(membership.role);

  if (request.method === "POST" && teamsSubpath.length === 2 && teamsSubpath[1] === "leave") {
    return leaveTeam({ db, memberId: membership.id, membership, request, teamId, userId });
  }

  if (request.method === "GET" && teamsSubpath.length === 1) {
    const team = await findActiveTeam(db, teamId);
    if (!team) {
      return jsonError("Organization not found", 404);
    }

    return json({ ...team, membership: { id: membership.id, role, status: membership.status } });
  }

  if (request.method === "PUT" && teamsSubpath.length === 1) {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    return updateTeamSettings({ db, request, teamId, userId, membership, role }, await readJsonOrNull(request));
  }

  if (request.method === "GET" && teamsSubpath[1] === "members") {
    return listTeamMembers({ db, teamId, role });
  }

  if (request.method === "PUT" && teamsSubpath[1] === "owner") {
    if (role !== "owner") {
      return jsonError("Only the Organization owner can transfer ownership", 403, {
        code: "owner_required",
      });
    }

    return transferTeamOwnership({ db, request, teamId, userId, membership }, await readJsonOrNull(request));
  }

  if (request.method === "GET" && teamsSubpath[1] === "activity") {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    return listTeamActivity({ db, env, teamId }, url);
  }

  if (request.method === "GET" && teamsSubpath[1] === "invites") {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    return listTeamInvites({ db, teamId });
  }

  if (request.method === "POST" && teamsSubpath[1] === "invites" && teamsSubpath[2] && teamsSubpath[3] === "link" && teamsSubpath.length === 4) {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    return reissueTeamInviteLink({ db, env, inviteId: teamsSubpath[2], request, teamId, userId });
  }

  if (request.method === "POST" && teamsSubpath[1] === "invites" && teamsSubpath.length === 2) {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    return createTeamInvite({ db, env, request, teamId, userId }, await readJsonOrNull(request));
  }

  if (request.method === "DELETE" && teamsSubpath[1] === "invites" && teamsSubpath[2]) {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    return revokeTeamInvite({ db, request, teamId, userId }, teamsSubpath[2]);
  }

  if (request.method === "PUT" && teamsSubpath[1] === "members" && teamsSubpath[2]) {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    return updateTeamMember({ db, request, teamId, userId, membership }, teamsSubpath[2], await readJsonOrNull(request));
  }

  return new Response("Method Not Allowed", { status: 405 });
}
