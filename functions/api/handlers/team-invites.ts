import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { createInviteToken, sha256Hex } from "../utils/crypto";
import { buildAuditEventValues } from "../utils/audit";
import { batchWriteMissed } from "../utils/guarded-writes";
import { buildTeamInviteDelivery } from "../utils/team-invite-delivery";
import { buildInviteRevocation } from "../utils/team-invite-revocation";
import { activeTeamManagerExists } from "../utils/team-access";
import { json, jsonError } from "../utils/response";
import { invalidPayloadResponse } from "../utils/request-json";

type Db = ReturnType<typeof createDb>;

const inviteTeamMemberBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(["admin", "editor", "runner", "viewer"]).default("viewer"),
});

function isInvitePending(invite: {
  accepted_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
}): boolean {
  if (invite.accepted_at || invite.revoked_at) return false;
  if (!invite.expires_at) return false;
  return Date.parse(invite.expires_at) > Date.now();
}

export async function listTeamInvites({ db, teamId }: { db: Db; teamId: string }): Promise<Response> {
  const { teamInvites, users } = schema;

  const now = new Date().toISOString();
  const rows = await db
    .select({
      id: teamInvites.id,
      team_id: teamInvites.team_id,
      email: teamInvites.email,
      role: teamInvites.role,
      invited_by_user_id: teamInvites.invited_by_user_id,
      expires_at: teamInvites.expires_at,
      created_at: teamInvites.created_at,
      updated_at: teamInvites.updated_at,
      inviterEmail: users.email,
      inviterName: users.name,
    })
    .from(teamInvites)
    .leftJoin(users, eq(users.id, teamInvites.invited_by_user_id))
    .where(
      and(
        eq(teamInvites.team_id, teamId),
        isNull(teamInvites.accepted_at),
        isNull(teamInvites.revoked_at),
        gt(teamInvites.expires_at, now),
        activeTeamManagerExists(db, teamInvites.team_id, teamInvites.invited_by_user_id),
      ),
    )
    .orderBy(desc(teamInvites.created_at));

  return json(rows);
}

export async function createTeamInvite(
  { db, env, request, teamId, userId }: { db: Db; env: Env; request: Request; teamId: string; userId: string },
  body: unknown,
): Promise<Response> {
  const { auditEvents, teamInvites, teamMembers, users } = schema;

  const parsed = inviteTeamMemberBodySchema.safeParse(body);
  if (!parsed.success) {
    return invalidPayloadResponse(parsed.error, "Invalid invite payload");
  }

  const inviteEmail = parsed.data.email;
  const now = new Date().toISOString();
  const [existingActiveMember] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .leftJoin(users, eq(users.id, teamMembers.user_id))
    .where(
      and(
        eq(teamMembers.team_id, teamId),
        eq(teamMembers.status, "active"),
        sql`lower(${users.email}) = ${inviteEmail}`,
      ),
    )
    .limit(1);
  if (existingActiveMember) {
    return jsonError("User is already an active Organization member", 409, {
      code: "team_member_exists",
    });
  }

  const [existingPendingInvite] = await db
    .select({
      id: teamInvites.id,
      expires_at: teamInvites.expires_at,
    })
    .from(teamInvites)
    .where(
      and(
        eq(teamInvites.team_id, teamId),
        eq(teamInvites.email, inviteEmail),
        isNull(teamInvites.accepted_at),
        isNull(teamInvites.revoked_at),
        gt(teamInvites.expires_at, now),
        activeTeamManagerExists(db, teamInvites.team_id, teamInvites.invited_by_user_id),
      ),
    )
    .limit(1);
  if (existingPendingInvite) {
    return jsonError("Invite already pending for this email", 409, {
      code: "team_invite_exists",
      details: {
        inviteId: existingPendingInvite.id,
        expiresAt: existingPendingInvite.expires_at,
      },
    });
  }

  const token = createInviteToken();
  const tokenHash = await sha256Hex(token);
  if (!tokenHash) {
    return jsonError("Unable to create invite token", 500);
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const invite = {
    id: crypto.randomUUID(),
    team_id: teamId,
    email: inviteEmail,
    role: parsed.data.role,
    token_hash: tokenHash,
    invited_by_user_id: userId,
    accepted_by_user_id: null,
    expires_at: expiresAt,
    accepted_at: null,
    revoked_at: null,
    created_at: now,
    updated_at: now,
  };

  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: { type: "team", id: teamId },
    resource: { type: "team_invite", id: invite.id },
    action: "team_invite.created",
    after: {
      id: invite.id,
      team_id: invite.team_id,
      email: invite.email,
      role: invite.role,
      expires_at: invite.expires_at,
    },
    request,
    createdAt: now,
  });
  await db.batch([
    db.insert(teamInvites).values(invite),
    db.insert(auditEvents).values(auditEvent),
  ]);

  const delivery = buildTeamInviteDelivery({
    frontendUrl: env.FRONTEND_URL,
    request,
    token,
  });

  return json({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expiresAt,
    inviteToken: token,
    invitePath: delivery.invitePath,
    inviteUrl: delivery.inviteUrl,
    delivery,
  });
}

export async function revokeTeamInvite(
  { db, request, teamId, userId }: { db: Db; request: Request; teamId: string; userId: string },
  inviteId: string,
): Promise<Response> {
  const { teamInvites } = schema;

  const now = new Date().toISOString();
  const [invite] = await db
    .select()
    .from(teamInvites)
    .where(
      and(
        eq(teamInvites.id, inviteId),
        eq(teamInvites.team_id, teamId),
        isNull(teamInvites.accepted_at),
        isNull(teamInvites.revoked_at),
        gt(teamInvites.expires_at, now),
      ),
    )
    .limit(1);

  if (!invite || !isInvitePending(invite)) {
    return jsonError("Invite not found", 404);
  }

  const [revoke, revokeAudit] = await buildInviteRevocation({
    db,
    invite: { ...invite, id: inviteId },
    actorUserId: userId,
    request,
    now,
  });
  const [revokeResult] = await db.batch([revoke, revokeAudit]);
  if (batchWriteMissed(revokeResult)) {
    const [current] = await db
      .select({ accepted_at: teamInvites.accepted_at })
      .from(teamInvites)
      .where(and(eq(teamInvites.id, inviteId), eq(teamInvites.team_id, teamId)))
      .limit(1);
    return current?.accepted_at
      ? jsonError("Invite was already accepted", 409, { code: "invite_already_accepted" })
      : jsonError("Invite not found", 404);
  }

  return json({ success: true });
}
