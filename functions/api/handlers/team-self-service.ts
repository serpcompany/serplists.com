import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { buildAuditEventValues } from "../utils/audit";
import { batchWriteMissed, insertAuditEventWhere } from "../utils/guarded-writes";
import { sha256Hex } from "../utils/crypto";
import { json, jsonError } from "../utils/response";
import { activeTeamManagerExists, normalizeTeamRole, type TeamMembership } from "../utils/team-access";
import { buildInviteRevocation, selectPendingInvitesFromInviter } from "../utils/team-invite-revocation";

// Routes an invitee or member calls for their own membership: preview or
// decline an invite link before joining, and leave an Organization.

type Db = ReturnType<typeof createDb>;

export async function getCurrentUserEmail(env: Env, userId: string): Promise<string | null> {
  const db = createDb(env);
  const { users } = schema;

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.email ?? null;
}

function emailMatches(userEmail: string | null, inviteEmail: string): boolean {
  return Boolean(userEmail) && userEmail!.toLowerCase() === inviteEmail.toLowerCase();
}

function isExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now();
}

const inviteNotFound = () => jsonError("Invite not found", 404);
// The body never names the invited address, so holding a link does not reveal it.
export const inviteEmailMismatch = () =>
  jsonError("Invite is for a different email address", 403, { code: "invite_email_mismatch" });
const inviteExpired = () => jsonError("Invite expired", 410, { code: "invite_expired" });

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * GET /api/teams/invites/:token. Read-only: it never writes, so opening an
 * invite link cannot join anyone. It names the Organization only to the
 * invited account, so a leaked link reveals nothing to other accounts.
 */
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
  const { team_invites, team_members, teams, users } = schema;

  const tokenHash = await sha256Hex(token);
  if (!tokenHash) {
    return jsonError("Unable to verify invite token", 500);
  }

  const [invite] = await db
    .select({
      id: team_invites.id,
      team_id: team_invites.team_id,
      email: team_invites.email,
      role: team_invites.role,
      expires_at: team_invites.expires_at,
      accepted_at: team_invites.accepted_at,
      accepted_by_user_id: team_invites.accepted_by_user_id,
      revoked_at: team_invites.revoked_at,
      teamId: teams.id,
      teamName: teams.name,
      teamSlug: teams.slug,
      teamArchivedAt: teams.archived_at,
      inviterName: users.name,
      inviterEmail: users.email,
      inviterCanManage: activeTeamManagerExists(db, team_invites.team_id, team_invites.invited_by_user_id),
    })
    .from(team_invites)
    .leftJoin(teams, eq(teams.id, team_invites.team_id))
    .leftJoin(users, eq(users.id, team_invites.invited_by_user_id))
    .where(eq(team_invites.token_hash, tokenHash))
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
      .select({ id: team_members.id, role: team_members.role })
      .from(team_members)
      .where(
        and(
          eq(team_members.team_id, invite.team_id),
          eq(team_members.user_id, userId),
          eq(team_members.status, "active"),
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

  // Accepting needs the inviter to still manage the Organization, so an invite
  // whose inviter left or lost access is shown as gone, as accept treats it.
  if (!invite.inviterCanManage) {
    return noStore(inviteNotFound());
  }

  if (isExpired(invite.expires_at)) {
    return noStore(inviteExpired());
  }

  return noStore(json({ status: "pending", ...preview }));
}

/** POST /api/teams/invites/:token/decline: the invited account revokes its own pending invite. */
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
  const { team_invites } = schema;

  const tokenHash = await sha256Hex(token);
  if (!tokenHash) {
    return jsonError("Unable to verify invite token", 500);
  }

  const [invite] = await db.select().from(team_invites).where(eq(team_invites.token_hash, tokenHash)).limit(1);
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
      .update(team_invites)
      .set({ revoked_at: now, updated_at: now })
      .where(
        and(
          eq(team_invites.id, inviteId),
          isNull(team_invites.accepted_at),
          isNull(team_invites.revoked_at),
        ),
      ),
    insertAuditEventWhere(
      db,
      auditEvent,
      sql`exists (
        select 1
        from ${team_invites}
        where ${team_invites.id} = ${inviteId}
          and ${team_invites.revoked_at} = ${now}
          and ${team_invites.accepted_at} is null
      )`,
    ),
  ]);

  // Accepted (in another tab, say) or revoked between the read and the write.
  if (batchWriteMissed(results[0])) {
    return inviteNotFound();
  }

  return json({ success: true });
}

/**
 * POST /api/teams/:teamId/leave: an active non-owner member removes their own
 * membership. The row is deleted rather than disabled so a manager cannot
 * silently re-activate someone who left; rejoining takes a new invite. The
 * pending invites they created are revoked, since an invite carries its
 * inviter's authority and rejoining must not bring them back.
 */
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
  const { team_members } = schema;

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
      eq(team_members.id, memberId),
      eq(team_members.team_id, teamId),
      eq(team_members.user_id, userId),
      ne(team_members.role, "owner"),
    );
  const stillLeavable = () => sql`exists (select 1 from ${team_members} where ${leavableMembership()})`;
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
  // A deleted row leaves nothing to check afterwards, so the audit insert and
  // the invite revokes run first with the delete's own condition. A batch is one
  // transaction, so every statement sees the same row: nothing is recorded or
  // revoked unless the delete lands.
  const results = await db.batch([
    insertAuditEventWhere(db, auditEvent, stillLeavable()),
    ...inviteRevocations.flat(),
    db.delete(team_members).where(leavableMembership()),
  ]);

  // Ownership moved to this member, or they left in another tab, after the read.
  if (batchWriteMissed(results[results.length - 1])) {
    return jsonError("Your membership changed. Reload the page and try again.", 409, {
      code: "membership_changed",
    });
  }

  return json({ success: true });
}
