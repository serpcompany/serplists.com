import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { buildAuditEventValues } from "../utils/audit";
import { batchWriteMissed, insertAuditEventWhen } from "../utils/conditional-audit";
import { createInviteToken, sha256Hex } from "../utils/crypto";
import { json, jsonError } from "../utils/response";
import { buildTeamInviteDelivery } from "../utils/team-invite-delivery";

type Db = ReturnType<typeof createDb>;

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const reissueInviteLinkBodySchema = z
  .object({
    role: z.enum(["admin", "editor", "runner", "viewer"]).optional(),
  })
  .nullable();

async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function pendingTeamInviteWhere(teamId: string, inviteId: string, now: string) {
  const { team_invites } = schema;

  return and(
    eq(team_invites.id, inviteId),
    eq(team_invites.team_id, teamId),
    isNull(team_invites.accepted_at),
    isNull(team_invites.revoked_at),
    gt(team_invites.expires_at, now),
  );
}

/**
 * POST /api/teams/:teamId/invites/:inviteId/link. Only a hash of each invite
 * token is stored, so a link that was lost before it was copied cannot be
 * shown again. This gives the pending invite a new token (the previous link
 * stops working), restarts its 7-day window, and can change its role. The
 * caller must already be allowed to manage the Organization's invites.
 */
export async function reissueTeamInviteLink({
  db,
  env,
  inviteId,
  request,
  teamId,
  userId,
}: {
  db: Db;
  env: Env;
  inviteId: string;
  request: Request;
  teamId: string;
  userId: string;
}): Promise<Response> {
  const { team_invites } = schema;

  const parsed = reissueInviteLinkBodySchema.safeParse(await readOptionalJson(request));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid invite payload", 400);
  }

  const now = new Date().toISOString();
  const [invite] = await db
    .select({
      id: team_invites.id,
      email: team_invites.email,
      role: team_invites.role,
      expires_at: team_invites.expires_at,
    })
    .from(team_invites)
    .where(pendingTeamInviteWhere(teamId, inviteId, now))
    .limit(1);
  if (!invite) {
    return jsonError("Invite not found", 404);
  }

  const token = createInviteToken();
  const tokenHash = await sha256Hex(token);
  if (!tokenHash) {
    return jsonError("Unable to create invite token", 500);
  }

  const role = parsed.data?.role ?? invite.role;
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS).toISOString();
  // The audit row records the change, never the token or its hash.
  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: { type: "team", id: teamId },
    resource: { type: "team_invite", id: inviteId },
    action: "team_invite.link_reissued",
    before: { role: invite.role, expires_at: invite.expires_at },
    after: { id: inviteId, team_id: teamId, email: invite.email, role, expires_at: expiresAt },
    request,
    createdAt: now,
  });
  const results = await db.batch([
    db
      .update(team_invites)
      .set({ token_hash: tokenHash, role, expires_at: expiresAt, updated_at: now })
      .where(pendingTeamInviteWhere(teamId, inviteId, now)),
    insertAuditEventWhen(
      db,
      auditEvent,
      sql`exists (select 1 from ${team_invites} where ${team_invites.id} = ${inviteId} and ${team_invites.token_hash} = ${tokenHash})`,
    ),
  ]);

  // Accepted, revoked, or expired between the read and the write.
  if (batchWriteMissed(results[0])) {
    return jsonError("Invite not found", 404);
  }

  const delivery = buildTeamInviteDelivery({ frontendUrl: env.FRONTEND_URL, request, token });

  return json({
    id: inviteId,
    email: invite.email,
    role,
    expiresAt,
    inviteToken: token,
    invitePath: delivery.invitePath,
    inviteUrl: delivery.inviteUrl,
    delivery,
  });
}
