import { and, eq, exists, gt, isNull, notExists, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { schema, type createDb } from "../db";
import { buildAuditEventValues } from "./audit";
import { insertAuditEventWhere } from "./guarded-writes";

type Db = ReturnType<typeof createDb>;
export type TeamInvite = typeof schema.team_invites.$inferSelect & { id: string };

function hasId(invite: typeof schema.team_invites.$inferSelect): invite is TeamInvite {
  return typeof invite.id === "string";
}

/** Pending (not accepted, revoked, or expired) invites in the Organization for the user's email. */
export async function selectPendingInvitesForUser(
  db: Db,
  teamId: string,
  userId: string,
  now: string,
): Promise<TeamInvite[]> {
  const { team_invites, users } = schema;

  // Scoped to one Organization's invites; lower() also matches legacy rows stored in mixed case.
  const invites = await db
    .select()
    .from(team_invites)
    .where(
      and(
        eq(team_invites.team_id, teamId),
        sql`lower(${team_invites.email}) = (select lower(${users.email}) from ${users} where ${users.id} = ${userId})`,
        isNull(team_invites.accepted_at),
        isNull(team_invites.revoked_at),
        gt(team_invites.expires_at, now),
      ),
    );
  return invites.filter(hasId);
}

/** Pending (not accepted, revoked, or expired) invites that `inviterUserId` created in the Organization. */
export async function selectPendingInvitesFromInviter(
  db: Db,
  teamId: string,
  inviterUserId: string,
  now: string,
): Promise<TeamInvite[]> {
  const { team_invites } = schema;

  // Reads one Organization's invites through the (team_id, email) index prefix.
  const invites = await db
    .select()
    .from(team_invites)
    .where(
      and(
        eq(team_invites.team_id, teamId),
        eq(team_invites.invited_by_user_id, inviterUserId),
        isNull(team_invites.accepted_at),
        isNull(team_invites.revoked_at),
        gt(team_invites.expires_at, now),
      ),
    );
  return invites.filter(hasId);
}

/**
 * The two batch statements that revoke a pending invite and record `team_invite.revoked`.
 * The revoke applies only while the invite is still pending (and `guard` holds, if given);
 * the audit event is written only when this revoke happened. An invite is revoked once, so
 * the event is also skipped if one exists: two revokes in the same millisecond share `now`.
 */
export async function buildInviteRevocation({
  db,
  invite,
  actorUserId,
  request,
  now,
  metadata,
  guard,
}: {
  db: Db;
  invite: TeamInvite;
  actorUserId: string;
  request: Request;
  now: string;
  metadata?: Record<string, unknown>;
  guard?: SQL;
}) {
  const { audit_events, team_invites } = schema;
  const revoked = alias(team_invites, "revoked_invite");
  const loggedRevoke = alias(audit_events, "logged_revoke");
  const auditEvent = await buildAuditEventValues({
    actorUserId,
    subject: { type: "team", id: invite.team_id },
    resource: { type: "team_invite", id: invite.id },
    action: "team_invite.revoked",
    before: invite,
    after: { ...invite, revoked_at: now, updated_at: now },
    metadata,
    request,
    createdAt: now,
  });
  const revokedNow = exists(
    db.select({ id: revoked.id }).from(revoked).where(
      and(
        eq(revoked.id, invite.id),
        eq(revoked.team_id, invite.team_id),
        isNull(revoked.accepted_at),
        eq(revoked.revoked_at, now),
        eq(revoked.updated_at, now),
      ),
    ),
  );

  return [
    db
      .update(team_invites)
      .set({ revoked_at: now, updated_at: now })
      .where(
        and(
          eq(team_invites.id, invite.id),
          eq(team_invites.team_id, invite.team_id),
          isNull(team_invites.accepted_at),
          isNull(team_invites.revoked_at),
          guard,
        ),
      ),
    insertAuditEventWhere(
      db,
      auditEvent,
      and(
        revokedNow,
        notExists(
          db.select({ id: loggedRevoke.id }).from(loggedRevoke).where(
            and(
              eq(loggedRevoke.resource_type, "team_invite"),
              eq(loggedRevoke.resource_id, invite.id),
              eq(loggedRevoke.action, "team_invite.revoked"),
            ),
          ),
        ),
      ) as SQL,
    ),
  ] as const;
}
