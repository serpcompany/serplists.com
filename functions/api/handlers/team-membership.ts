import { and, eq, exists, inArray, isNull, ne, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { schema, type createDb } from "../db";
import { buildAuditEventValues } from "../utils/audit";
import { batchWriteMissed, insertAuditEventWhere } from "../utils/guarded-writes";
import {
  buildInviteRevocation,
  selectPendingInvitesForUser,
  selectPendingInvitesFromInviter,
} from "../utils/team-invite-revocation";
import { canManageTeam, normalizeTeamRole, type TeamMembership } from "../utils/team-access";
import { json, jsonError } from "../utils/response";

export type TeamRouteContext = {
  db: ReturnType<typeof createDb>;
  request: Request;
  teamId: string;
  userId: string;
  membership: TeamMembership;
};

const updateTeamMemberBodySchema = z.object({
  role: z.enum(["admin", "editor", "runner", "viewer"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

const transferTeamOwnerBodySchema = z.object({
  memberId: z.string().trim().min(1),
});

export async function transferTeamOwnership(context: TeamRouteContext, body: unknown): Promise<Response> {
  const { db, request, teamId, userId, membership } = context;
  const { team_members, teams } = schema;

  const parsed = transferTeamOwnerBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid owner transfer payload", 400);
  }

  const ownerMemberId = membership.id;
  if (!ownerMemberId) {
    return jsonError("Organization not found", 404);
  }
  if (parsed.data.memberId === ownerMemberId) {
    return jsonError("This member is already the Organization owner", 400, {
      code: "owner_transfer_noop",
    });
  }

  const [targetMember] = await db
    .select()
    .from(team_members)
    .where(
      and(
        eq(team_members.id, parsed.data.memberId),
        eq(team_members.team_id, teamId),
        eq(team_members.status, "active"),
      ),
    )
    .limit(1);

  const targetMemberId = targetMember?.id;
  if (!targetMember || !targetMemberId) {
    return jsonError("Member not found", 404);
  }
  if (normalizeTeamRole(targetMember.role) === "owner") {
    return jsonError("Member is already the Organization owner", 400, {
      code: "owner_transfer_noop",
    });
  }

  const now = new Date().toISOString();
  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: { type: "team", id: teamId },
    resource: { type: "team", id: teamId },
    action: "team.owner_transferred",
    before: {
      ownerMemberId: membership.id,
      ownerUserId: membership.user_id,
    },
    after: {
      ownerMemberId: targetMember.id,
      ownerUserId: targetMember.user_id,
    },
    diff: {
      previousOwnerMemberId: membership.id,
      previousOwnerUserId: membership.user_id,
      nextOwnerMemberId: targetMember.id,
      nextOwnerUserId: targetMember.user_id,
    },
    request,
    createdAt: now,
  });

  const target = alias(team_members, "target_member");
  const previousOwner = alias(team_members, "previous_owner");
  const activeOwner = alias(team_members, "active_owner");
  const activeTeam = alias(teams, "active_team");
  const targetIsActiveNonOwner = exists(
    db.select({ id: target.id }).from(target).where(
      and(eq(target.id, targetMemberId), eq(target.team_id, teamId), eq(target.status, "active"), ne(target.role, "owner")),
    ),
  );
  const teamIsActive = exists(
    db.select({ id: activeTeam.id }).from(activeTeam).where(and(eq(activeTeam.id, teamId), isNull(activeTeam.archived_at))),
  );
  const ownerDemotedNow = exists(
    db.select({ id: previousOwner.id }).from(previousOwner).where(
      and(
        eq(previousOwner.id, ownerMemberId),
        eq(previousOwner.team_id, teamId),
        eq(previousOwner.role, "admin"),
        eq(previousOwner.status, "active"),
        eq(previousOwner.updated_at, now),
      ),
    ),
  );
  const noActiveOwner = notExists(
    db.select({ id: activeOwner.id }).from(activeOwner).where(
      and(eq(activeOwner.team_id, teamId), eq(activeOwner.role, "owner"), eq(activeOwner.status, "active")),
    ),
  );
  const targetPromotedNow = () => exists(
    db.select({ id: target.id }).from(target).where(
      and(
        eq(target.id, targetMemberId),
        eq(target.team_id, teamId),
        eq(target.role, "owner"),
        eq(target.status, "active"),
        eq(target.updated_at, now),
      ),
    ),
  );

  const [, promoteResult] = await db.batch([
    db
      .update(team_members)
      .set({ role: "admin", updated_at: now })
      .where(
        and(
          eq(team_members.id, ownerMemberId),
          eq(team_members.team_id, teamId),
          eq(team_members.role, "owner"),
          eq(team_members.status, "active"),
          targetIsActiveNonOwner,
          teamIsActive,
        ),
      ),
    db
      .update(team_members)
      .set({ role: "owner", updated_at: now })
      .where(
        and(
          eq(team_members.id, targetMemberId),
          eq(team_members.team_id, teamId),
          eq(team_members.status, "active"),
          ne(team_members.role, "owner"),
          ownerDemotedNow,
          noActiveOwner,
        ),
      ),
    db
      .update(teams)
      .set({ billing_owner_user_id: targetMember.user_id, updated_at: now })
      .where(and(eq(teams.id, teamId), isNull(teams.archived_at), targetPromotedNow())),
    insertAuditEventWhere(db, auditEvent, targetPromotedNow()),
  ]);

  if (batchWriteMissed(promoteResult)) {
    const [currentOwner] = await db
      .select({ id: team_members.id })
      .from(team_members)
      .where(
        and(
          eq(team_members.id, targetMemberId),
          eq(team_members.team_id, teamId),
          eq(team_members.role, "owner"),
          eq(team_members.status, "active"),
        ),
      )
      .limit(1);
    if (!currentOwner) {
      return jsonError("Ownership could not be transferred", 409, {
        code: "owner_transfer_conflict",
      });
    }
  }

  return json({
    success: true,
    ownerMemberId: targetMember.id,
    ownerUserId: targetMember.user_id,
  });
}

export async function updateTeamMember(
  context: TeamRouteContext,
  memberId: string,
  body: unknown,
): Promise<Response> {
  const { db, request, teamId, userId } = context;
  const { team_members } = schema;

  const parsed = updateTeamMemberBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid member payload", 400);
  }
  if (typeof parsed.data.role === "undefined" && typeof parsed.data.status === "undefined") {
    return jsonError("No fields to update", 400);
  }

  const [targetMember] = await db
    .select()
    .from(team_members)
    .where(and(eq(team_members.id, memberId), eq(team_members.team_id, teamId)))
    .limit(1);

  if (!targetMember) {
    return jsonError("Member not found", 404);
  }
  if (targetMember.user_id === userId) {
    return jsonError("Organization members cannot change their own membership from this endpoint", 400, {
      code: "self_membership_update_forbidden",
    });
  }
  if (normalizeTeamRole(targetMember.role) === "owner") {
    return jsonError("Owner membership cannot be changed from this endpoint", 400, {
      code: "owner_membership_update_forbidden",
    });
  }

  const now = new Date().toISOString();
  const updates = {
    ...(parsed.data.role ? { role: parsed.data.role } : {}),
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    updated_at: now,
  };

  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: { type: "team", id: teamId },
    resource: { type: "team_member", id: memberId },
    action: "team_member.updated",
    before: targetMember,
    after: { ...targetMember, ...updates },
    diff: updates,
    request,
    createdAt: now,
  });

  const actor = alias(team_members, "actor_member");
  const updated = alias(team_members, "updated_member");
  const actorManagesTeam = exists(
    db.select({ id: actor.id }).from(actor).where(
      and(
        eq(actor.team_id, teamId),
        eq(actor.user_id, userId),
        eq(actor.status, "active"),
        inArray(actor.role, ["owner", "admin"]),
      ),
    ),
  );
  const memberUpdatedNow = exists(
    db.select({ id: updated.id }).from(updated).where(
      and(
        eq(updated.id, memberId),
        eq(updated.team_id, teamId),
        ne(updated.role, "owner"),
        eq(updated.updated_at, now),
      ),
    ),
  );

  const statusChanged = typeof parsed.data.status !== "undefined" && parsed.data.status !== targetMember.status;
  const staleInvites = statusChanged ? await selectPendingInvitesForUser(db, teamId, targetMember.user_id, now) : [];
  const nextStatus = parsed.data.status ?? targetMember.status;
  const nextRole = normalizeTeamRole(parsed.data.role ?? targetMember.role);
  const inviterLosesAccess = targetMember.status === "active"
    && canManageTeam(normalizeTeamRole(targetMember.role))
    && (nextStatus !== "active" || !canManageTeam(nextRole));
  const inviterInvites = inviterLosesAccess
    ? await selectPendingInvitesFromInviter(db, teamId, targetMember.user_id, now)
    : [];
  const staleInviteIds = new Set(staleInvites.map((invite) => invite.id));
  const revocations = [
    ...staleInvites.map((invite) => ({ invite, reason: "member_status_changed" })),
    ...inviterInvites
      .filter((invite) => !staleInviteIds.has(invite.id))
      .map((invite) => ({ invite, reason: "inviter_access_removed" })),
  ];
  const inviteRevocations = await Promise.all(
    revocations.map(({ invite, reason }) =>
      buildInviteRevocation({
        db,
        invite,
        actorUserId: userId,
        request,
        now,
        metadata: { reason },
        guard: memberUpdatedNow,
      })),
  );

  const [updateResult] = await db.batch([
    db
      .update(team_members)
      .set(updates)
      .where(
        and(
          eq(team_members.id, memberId),
          eq(team_members.team_id, teamId),
          ne(team_members.role, "owner"),
          ne(team_members.user_id, userId),
          actorManagesTeam,
        ),
      ),
    insertAuditEventWhere(db, auditEvent, memberUpdatedNow),
    ...inviteRevocations.flat(),
  ]);

  if (batchWriteMissed(updateResult)) {
    return jsonError("Member could not be updated", 409, {
      code: "member_update_conflict",
    });
  }

  return json({ success: true });
}
