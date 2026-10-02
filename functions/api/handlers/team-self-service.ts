import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { buildAuditEventValues } from "../utils/audit";
import { insertRowWhere } from "../utils/guarded-insert";
import { batchWriteMissed } from "../utils/guarded-writes";
import { sha256Hex } from "../utils/crypto";
import { json, jsonError } from "../utils/response";
import { activeTeamManagerExists, normalizeTeamRole, type TeamMembership } from "../utils/team-access";
import { buildInviteRevocation, selectPendingInvitesFromInviter } from "../utils/team-invite-revocation";

type Db = ReturnType<typeof createDb>;
type TeamInviteRow = typeof schema.teamInvites.$inferSelect;

export async function getCurrentUserEmail(env: Env, userId: string): Promise<string | null> {
  const db = createDb(env);
  const { users } = schema;

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.email ?? null;
}

function emailMatches(userEmail: string | null, inviteEmail: string): boolean {
  return userEmail ? userEmail.toLowerCase() === inviteEmail.toLowerCase() : false;
}

function isExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now();
}

const inviteNotFound = () => jsonError("Invite not found", 404);
export const inviteEmailMismatch = () =>
  jsonError("Invite is for a different email address", 403, { code: "invite_email_mismatch" });
const inviteExpired = () => jsonError("Invite expired", 410, { code: "invite_expired" });

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function findInviteByToken(
  db: Db,
  token: string,
): Promise<{ invite: TeamInviteRow | undefined } | { response: Response }> {
  const { teamInvites } = schema;

  const tokenHash = await sha256Hex(token);
  if (!tokenHash) {
    return { response: jsonError("Unable to verify invite token", 500) };
  }

  const [invite] = await db.select().from(teamInvites).where(eq(teamInvites.token_hash, tokenHash)).limit(1);
  return { invite };
}

export async function previewTeamInvite({
  db,
  env,
  token,
  userId,
}: {
  db: Db;
  env: Env;
  token: string;
  userId: string;
}): Promise<Response> {
  const { teamInvites, teamMembers, teams, users } = schema;

  const tokenHash = await sha256Hex(token);
  if (!tokenHash) {
    return jsonError("Unable to verify invite token", 500);
  }

  const [invite] = await db
    .select({
      id: teamInvites.id,
      team_id: teamInvites.team_id,
      email: teamInvites.email,
      role: teamInvites.role,
      expires_at: teamInvites.expires_at,
      accepted_at: teamInvites.accepted_at,
      accepted_by_user_id: teamInvites.accepted_by_user_id,
      revoked_at: teamInvites.revoked_at,
      teamId: teams.id,
      teamName: teams.name,
      teamSlug: teams.slug,
      teamArchivedAt: teams.archived_at,
      inviterName: users.name,
      inviterEmail: users.email,
      inviterCanManage: activeTeamManagerExists(db, teamInvites.team_id, teamInvites.invited_by_user_id),
    })
    .from(teamInvites)
    .leftJoin(teams, eq(teams.id, teamInvites.team_id))
    .leftJoin(users, eq(users.id, teamInvites.invited_by_user_id))
    .where(eq(teamInvites.token_hash, tokenHash))
    .limit(1);

  if (!invite || invite.revoked_at || !invite.teamId || !invite.teamName || invite.teamArchivedAt) {
    return noStore(inviteNotFound());
  }

  if (!emailMatches(await getCurrentUserEmail(env, userId), invite.email)) {
    return noStore(inviteEmailMismatch());
  }

  const preview = {
    teamId: invite.teamId,
    teamName: invite.teamName,
    teamSlug: invite.teamSlug ?? null,
    role: normalizeTeamRole(invite.role, "viewer"),
    expiresAt: invite.expires_at,
    inviterName: invite.inviterName ?? null,
    inviterEmail: invite.inviterEmail ?? null,
  };

  if (invite.accepted_at) {
    if (invite.accepted_by_user_id !== userId) {
      return noStore(inviteNotFound());
    }

    const [membership] = await db
      .select({ id: teamMembers.id, role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.team_id, invite.team_id),
          eq(teamMembers.user_id, userId),
          eq(teamMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!membership) {
      return noStore(inviteNotFound());
    }

    return noStore(
      json({ status: "already_member", ...preview, role: normalizeTeamRole(membership.role) }),
    );
  }

  if (!invite.inviterCanManage) {
    return noStore(inviteNotFound());
  }

  if (isExpired(invite.expires_at)) {
    return noStore(inviteExpired());
  }

  return noStore(json({ status: "pending", ...preview }));
}

export async function declineTeamInvite({
  db,
  env,
  request,
  token,
  userId,
}: {
  db: Db;
  env: Env;
  request: Request;
  token: string;
  userId: string;
}): Promise<Response> {
  const { teamInvites } = schema;

  const found = await findInviteByToken(db, token);
  if ("response" in found) {
    return found.response;
  }

  const { invite } = found;
  if (!invite?.id || invite.revoked_at || invite.accepted_at) {
    return inviteNotFound();
  }
  const inviteId = invite.id;

  if (!emailMatches(await getCurrentUserEmail(env, userId), invite.email)) {
    return inviteEmailMismatch();
  }

  if (isExpired(invite.expires_at)) {
    return inviteExpired();
  }

  const now = new Date().toISOString();
  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: { type: "team", id: invite.team_id },
    resource: { type: "team_invite", id: inviteId },
    action: "team_invite.declined",
    after: { inviteId, revoked_at: now },
    request,
    createdAt: now,
  });
  const results = await db.batch([
    db
      .update(teamInvites)
      .set({ revoked_at: now, updated_at: now })
      .where(
        and(
          eq(teamInvites.id, inviteId),
          isNull(teamInvites.accepted_at),
          isNull(teamInvites.revoked_at),
        ),
      ),
    insertRowWhere(
      db,
      schema.auditEvents,
      auditEvent,
      sql`exists (
        select 1
        from ${teamInvites}
        where ${teamInvites.id} = ${inviteId}
          and ${teamInvites.revoked_at} = ${now}
          and ${teamInvites.accepted_at} is null
      )`,
    ),
  ]);

  if (batchWriteMissed(results[0])) {
    return inviteNotFound();
  }

  return json({ success: true });
}

export async function leaveTeam({
  db,
  memberId,
  membership,
  request,
  teamId,
  userId,
}: {
  db: Db;
  memberId: string;
  membership: TeamMembership;
  request: Request;
  teamId: string;
  userId: string;
}): Promise<Response> {
  const { teamMembers } = schema;

  if (normalizeTeamRole(membership.role) === "owner") {
    return jsonError("Transfer ownership before leaving this Organization", 400, {
      code: "owner_must_transfer",
    });
  }

  const now = new Date().toISOString();
  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: { type: "team", id: teamId },
    resource: { type: "team_member", id: memberId },
    action: "team_member.left",
    before: membership,
    request,
    createdAt: now,
  });
  const leavableMembership = () =>
    and(
      eq(teamMembers.id, memberId),
      eq(teamMembers.team_id, teamId),
      eq(teamMembers.user_id, userId),
      ne(teamMembers.role, "owner"),
    );
  const stillLeavable = () => sql`exists (select 1 from ${teamMembers} where ${leavableMembership()})`;
  const inviteRevocations = await Promise.all(
    (await selectPendingInvitesFromInviter(db, teamId, userId, now)).map((invite) =>
      buildInviteRevocation({
        db,
        invite,
        actorUserId: userId,
        request,
        now,
        metadata: { reason: "inviter_left" },
        guard: stillLeavable(),
      })),
  );
  const results = await db.batch([
    insertRowWhere(db, schema.auditEvents, auditEvent, stillLeavable()),
    ...inviteRevocations.flat(),
    db.delete(teamMembers).where(leavableMembership()),
  ]);

  if (batchWriteMissed(results[results.length - 1])) {
    return jsonError("Your membership changed. Reload the page and try again.", 409, {
      code: "membership_changed",
    });
  }

  return json({ success: true });
}
