import { and, desc, eq, gt, isNotNull, isNull, not, sql } from "drizzle-orm";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { buildAuditEventValues } from "../utils/audit";
import { insertAuditEventWhere } from "../utils/guarded-writes";
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
  const { team_invites } = schema;

  return and(
    eq(team_invites.id, invite.id),
    // The invite as read: a new link made meanwhile (a new token, maybe a new role) leaves
    // it unaccepted, so neither the old link nor the old role is ever applied.
    eq(team_invites.token_hash, invite.token_hash),
    eq(team_invites.role, invite.role),
    isNull(team_invites.accepted_at),
    isNull(team_invites.revoked_at),
    gt(team_invites.expires_at, now),
    // An inviter disabled or demoted after the checks below leaves the invite unaccepted.
    activeTeamManagerExists(db, invite.team_id, invite.invited_by_user_id),
  );
}

function acceptedInviteExistsSql(inviteId: string, userId: string, acceptedAt: string) {
  const { team_invites } = schema;

  return sql`exists (
    select 1
    from ${team_invites}
    where ${team_invites.id} = ${inviteId}
      and ${team_invites.accepted_by_user_id} = ${userId}
      and ${team_invites.accepted_at} = ${acceptedAt}
      and ${team_invites.revoked_at} is null
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
  invite: typeof schema.team_invites.$inferSelect;
  request: Request;
  userId: string;
}): Promise<Response> {
  const { team_invites, team_members, teams } = schema;

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
    .from(team_members)
    .where(and(eq(team_members.team_id, invite.team_id), eq(team_members.user_id, userId)))
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

  // An invite carries its inviter's authority: once they no longer manage the Organization,
  // it is treated like a revoked invite.
  const inviterMembership = await getActiveTeamMembership(env, invite.team_id, invite.invited_by_user_id);
  if (!inviterMembership || !canManageTeam(normalizeTeamRole(inviterMembership.role))) {
    return jsonError("Invite not found", 404);
  }

  if (Date.parse(invite.expires_at) <= Date.now()) {
    return jsonError("Invite expired", 410);
  }

  const now = new Date().toISOString();

  // An active member has nothing to accept. Applying the invite's role would override the
  // role an admin last chose, and consuming it would report a role that never applied, so
  // refuse it and revoke it; it can only be left over from a race or older data.
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
    // A disabled member rejoins with the invite's role.
    await db.batch([
      db.update(team_invites).set(inviteUpdates).where(pendingInviteWhere(db, pendingInvite, now)),
      db.update(team_members).set({
        role: inviteRole,
        status: "active",
        joined_at: existingMembership.joined_at ?? now,
        updated_at: now,
      }).where(and(eq(team_members.id, memberId), acceptedInviteExistsSql(invite.id, userId, now))),
      insertAuditEventWhere(db, auditEvent, acceptedInviteExistsSql(invite.id, userId, now)),
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
      db.update(team_invites).set(inviteUpdates).where(pendingInviteWhere(db, pendingInvite, now)),
      db.insert(team_members)
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
        .onConflictDoNothing({ target: [team_members.team_id, team_members.user_id] }),
      insertAuditEventWhere(db, auditEvent, acceptedInviteExistsSql(invite.id, userId, now)),
    ]);
  }

  const [acceptedInvite] = await db
    .select({ id: team_invites.id })
    .from(team_invites)
    .where(and(eq(team_invites.id, invite.id), eq(team_invites.accepted_by_user_id, userId), eq(team_invites.accepted_at, now), isNull(team_invites.revoked_at)))
    .limit(1);

  if (!acceptedInvite) {
    return jsonError("Invite could not be accepted", 409, {
      code: "invite_acceptance_conflict",
    });
  }

  const [acceptedMembership] = await db
    .select()
    .from(team_members)
    .where(and(eq(team_members.team_id, invite.team_id), eq(team_members.user_id, userId), eq(team_members.status, "active")))
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
  const { team_invites, teams, users } = schema;

  const userEmail = await getCurrentUserEmail(env, userId);
  if (!userEmail) {
    return json([]);
  }

  const now = new Date().toISOString();
  const inviteEmail = userEmail.toLowerCase();
  const rows = await db
    .select({
      id: team_invites.id,
      teamId: team_invites.team_id,
      teamName: teams.name,
      teamSlug: teams.slug,
      email: team_invites.email,
      role: team_invites.role,
      expiresAt: team_invites.expires_at,
      createdAt: team_invites.created_at,
      inviterEmail: users.email,
      inviterName: users.name,
    })
    .from(team_invites)
    .leftJoin(teams, eq(teams.id, team_invites.team_id))
    .leftJoin(users, eq(users.id, team_invites.invited_by_user_id))
    .where(
      and(
        eq(team_invites.email, inviteEmail),
        isNull(team_invites.accepted_at),
        isNull(team_invites.revoked_at),
        gt(team_invites.expires_at, now),
        isNotNull(teams.id),
        isNull(teams.archived_at),
        activeTeamManagerExists(db, team_invites.team_id, team_invites.invited_by_user_id),
        // Nothing to accept in an Organization the user is already an active member of.
        not(activeTeamMemberExists(db, team_invites.team_id, userId)),
      ),
    )
    .orderBy(desc(team_invites.created_at));

  return json(rows);
}
