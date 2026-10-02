import { and, desc, eq, gt, isNotNull, isNull, not, sql } from "drizzle-orm";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { buildAuditEventValues } from "../utils/audit";
import { insertRowWhere } from "../utils/guarded-insert";
import { buildInviteRevocation, type TeamInvite } from "../utils/team-invite-revocation";
import {
  activeTeamManagerExists,
  activeTeamMemberExists,
  canManageTeam,
  getActiveTeamMembership,
  normalizeTeamRole,
} from "../utils/team-access";
import { json, jsonError } from "../utils/response";
import { getCurrentUserEmail, inviteEmailMismatch } from "./team-self-service";

type Db = ReturnType<typeof createDb>;

function pendingInviteWhere(db: ReturnType<typeof createDb>, invite: TeamInvite, now: string) {
  const { teamInvites } = schema;

  return and(
    eq(teamInvites.id, invite.id),
    eq(teamInvites.token_hash, invite.token_hash),
    eq(teamInvites.role, invite.role),
    isNull(teamInvites.accepted_at),
    isNull(teamInvites.revoked_at),
    gt(teamInvites.expires_at, now),
    activeTeamManagerExists(db, invite.team_id, invite.invited_by_user_id),
  );
}

function acceptedInviteExistsSql(inviteId: string, userId: string, acceptedAt: string) {
  const { teamInvites } = schema;

  return sql`exists (
    select 1
    from ${teamInvites}
    where ${teamInvites.id} = ${inviteId}
      and ${teamInvites.accepted_by_user_id} = ${userId}
      and ${teamInvites.accepted_at} = ${acceptedAt}
      and ${teamInvites.revoked_at} is null
  )`;
}

export async function acceptTeamInviteRecord({
  db,
  env,
  invite,
  request,
  userId,
}: {
  db: ReturnType<typeof createDb>;
  env: Env;
  invite: typeof schema.teamInvites.$inferSelect;
  request: Request;
  userId: string;
}): Promise<Response> {
  const { teamInvites, teamMembers, teams } = schema;

  if (invite.revoked_at || !invite.id) {
    return jsonError("Invite not found", 404);
  }
  const pendingInvite: TeamInvite = { ...invite, id: invite.id };

  const [team] = await db
    .select({ id: teams.id, name: teams.name, slug: teams.slug })
    .from(teams)
    .where(and(eq(teams.id, invite.team_id), isNull(teams.archived_at)))
    .limit(1);
  if (!team) {
    return jsonError("Organization not found", 404);
  }

  const userEmail = await getCurrentUserEmail(env, userId);
  if (!userEmail || userEmail.toLowerCase() !== invite.email.toLowerCase()) {
    return inviteEmailMismatch();
  }

  const [existingMembership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.team_id, invite.team_id), eq(teamMembers.user_id, userId)))
    .limit(1);

  if (invite.accepted_at) {
    if (invite.accepted_by_user_id === userId && existingMembership?.status === "active") {
      const existingRole = normalizeTeamRole(existingMembership.role);
      return json({
        teamId: invite.team_id,
        memberId: existingMembership.id,
        role: existingRole,
        team: {
          id: invite.team_id,
          memberId: existingMembership.id,
          membershipStatus: existingMembership.status,
          name: team.name,
          role: existingRole,
          slug: team.slug,
        },
      });
    }

    return jsonError("Invite not found", 404);
  }

  const inviterMembership = await getActiveTeamMembership(env, invite.team_id, invite.invited_by_user_id);
  if (!inviterMembership || !canManageTeam(normalizeTeamRole(inviterMembership.role))) {
    return jsonError("Invite not found", 404);
  }

  if (Date.parse(invite.expires_at) <= Date.now()) {
    return jsonError("Invite expired", 410);
  }

  const now = new Date().toISOString();

  if (existingMembership?.status === "active") {
    const [revoke, revokeAudit] = await buildInviteRevocation({
      db,
      invite: pendingInvite,
      actorUserId: userId,
      request,
      now,
      metadata: { reason: "invitee_already_member" },
      guard: activeTeamMemberExists(db, invite.team_id, userId),
    });
    await db.batch([revoke, revokeAudit]);
    return jsonError("You are already a member of this Organization", 409, {
      code: "team_member_exists",
      details: { teamId: invite.team_id, role: normalizeTeamRole(existingMembership.role) },
    });
  }

  const inviteRole = normalizeTeamRole(invite.role, "viewer");
  const memberId = existingMembership?.id ?? crypto.randomUUID();
  const inviteUpdates = {
    accepted_by_user_id: userId,
    accepted_at: now,
    updated_at: now,
  };
  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: { type: "team", id: invite.team_id },
    resource: { type: "team_invite", id: invite.id },
    action: "team_invite.accepted",
    after: { inviteId: invite.id, memberId, role: inviteRole },
    request,
    createdAt: now,
  });

  if (existingMembership) {
    await db.batch([
      db.update(teamInvites).set(inviteUpdates).where(pendingInviteWhere(db, pendingInvite, now)),
      db.update(teamMembers).set({
        role: inviteRole,
        status: "active",
        joined_at: existingMembership.joined_at ?? now,
        updated_at: now,
      }).where(and(eq(teamMembers.id, memberId), acceptedInviteExistsSql(invite.id, userId, now))),
      insertRowWhere(db, schema.auditEvents, auditEvent, acceptedInviteExistsSql(invite.id, userId, now)),
    ]);
  } else {
    const insertedMembership = {
      id: memberId,
      team_id: invite.team_id,
      user_id: userId,
      role: inviteRole,
      status: "active",
      invited_by_user_id: invite.invited_by_user_id,
      joined_at: now,
      created_at: now,
      updated_at: now,
    };

    await db.batch([
      db.update(teamInvites).set(inviteUpdates).where(pendingInviteWhere(db, pendingInvite, now)),
      db.insert(teamMembers)
        .select(sql`
          select
            ${insertedMembership.id},
            ${insertedMembership.team_id},
            ${insertedMembership.user_id},
            ${insertedMembership.role},
            ${insertedMembership.status},
            ${insertedMembership.invited_by_user_id},
            ${insertedMembership.joined_at},
            ${insertedMembership.created_at},
            ${insertedMembership.updated_at}
          where ${acceptedInviteExistsSql(invite.id, userId, now)}
        `)
        .onConflictDoNothing({ target: [teamMembers.team_id, teamMembers.user_id] }),
      insertRowWhere(db, schema.auditEvents, auditEvent, acceptedInviteExistsSql(invite.id, userId, now)),
    ]);
  }

  const [acceptedInvite] = await db
    .select({ id: teamInvites.id })
    .from(teamInvites)
    .where(and(eq(teamInvites.id, invite.id), eq(teamInvites.accepted_by_user_id, userId), eq(teamInvites.accepted_at, now), isNull(teamInvites.revoked_at)))
    .limit(1);

  if (!acceptedInvite) {
    return jsonError("Invite could not be accepted", 409, {
      code: "invite_acceptance_conflict",
    });
  }

  const [acceptedMembership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.team_id, invite.team_id), eq(teamMembers.user_id, userId), eq(teamMembers.status, "active")))
    .limit(1);

  if (!acceptedMembership) {
    return jsonError("Invite could not be accepted", 409, {
      code: "invite_acceptance_conflict",
    });
  }

  const acceptedRole = normalizeTeamRole(acceptedMembership.role, inviteRole);
  return json({
    teamId: invite.team_id,
    memberId: acceptedMembership.id,
    role: acceptedRole,
    team: {
      id: invite.team_id,
      memberId: acceptedMembership.id,
      membershipStatus: acceptedMembership.status,
      name: team.name,
      role: acceptedRole,
      slug: team.slug,
    },
  });
}

export async function listIncomingTeamInvites({ db, env, userId }: { db: Db; env: Env; userId: string }): Promise<Response> {
  const { teamInvites, teams, users } = schema;

  const userEmail = await getCurrentUserEmail(env, userId);
  if (!userEmail) {
    return json([]);
  }

  const now = new Date().toISOString();
  const inviteEmail = userEmail.toLowerCase();
  const rows = await db
    .select({
      id: teamInvites.id,
      teamId: teamInvites.team_id,
      teamName: teams.name,
      teamSlug: teams.slug,
      email: teamInvites.email,
      role: teamInvites.role,
      expiresAt: teamInvites.expires_at,
      createdAt: teamInvites.created_at,
      inviterEmail: users.email,
      inviterName: users.name,
    })
    .from(teamInvites)
    .leftJoin(teams, eq(teams.id, teamInvites.team_id))
    .leftJoin(users, eq(users.id, teamInvites.invited_by_user_id))
    .where(
      and(
        eq(teamInvites.email, inviteEmail),
        isNull(teamInvites.accepted_at),
        isNull(teamInvites.revoked_at),
        gt(teamInvites.expires_at, now),
        isNotNull(teams.id),
        isNull(teams.archived_at),
        activeTeamManagerExists(db, teamInvites.team_id, teamInvites.invited_by_user_id),
        not(activeTeamMemberExists(db, teamInvites.team_id, userId)),
      ),
    )
    .orderBy(desc(teamInvites.created_at));

  return json(rows);
}
