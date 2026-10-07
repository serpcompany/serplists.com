import { and, eq, exists, gt, isNull, notExists, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { schema, type createDb } from "../db";
import { buildAuditEventValues } from "./audit";
import { allConditions, insertRowWhere } from "./guarded-insert";

type Db = ReturnType<typeof createDb>;
export type TeamInvite = typeof schema.teamInvites.$inferSelect & { id: string };

function hasId(invite: typeof schema.teamInvites.$inferSelect): invite is TeamInvite {
  return typeof invite.id === "string";
}

export async function selectPendingInvitesForUser(
  db: Db,
  teamId: string,
  userId: string,
  now: string,
): Promise<TeamInvite[]> {
  const { teamInvites, users } = schema;

  const invites = await db
    .select()
    .from(teamInvites)
    .where(
      and(
        eq(teamInvites.team_id, teamId),
        sql`lower(${teamInvites.email}) = (select lower(${users.email}) from ${users} where ${users.id} = ${userId})`,
        isNull(teamInvites.accepted_at),
        isNull(teamInvites.revoked_at),
        gt(teamInvites.expires_at, now),
      ),
    );
  return invites.filter(hasId);
}

export async function selectPendingInvitesFromInviter(
  db: Db,
  teamId: string,
  inviterUserId: string,
  now: string,
): Promise<TeamInvite[]> {
  const { teamInvites } = schema;

  const invites = await db
    .select()
    .from(teamInvites)
    .where(
      and(
        eq(teamInvites.team_id, teamId),
        eq(teamInvites.invited_by_user_id, inviterUserId),
        isNull(teamInvites.accepted_at),
        isNull(teamInvites.revoked_at),
        gt(teamInvites.expires_at, now),
      ),
    );
  return invites.filter(hasId);
}

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
  const { auditEvents, teamInvites } = schema;
  const revoked = alias(teamInvites, "revoked_invite");
  const loggedRevoke = alias(auditEvents, "logged_revoke");
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
      .update(teamInvites)
      .set({ revoked_at: now, updated_at: now })
      .where(
        and(
          eq(teamInvites.id, invite.id),
          eq(teamInvites.team_id, invite.team_id),
          isNull(teamInvites.accepted_at),
          isNull(teamInvites.revoked_at),
          guard,
        ),
      ),
    insertRowWhere(
      db,
      auditEvents,
      auditEvent,
      allConditions(
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
      ),
    ),
  ] as const;
}
