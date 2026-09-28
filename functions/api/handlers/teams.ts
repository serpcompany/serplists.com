import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { createDb, schema } from "../db";
import { createInviteToken, sha256Hex } from "../utils/crypto";
import { buildAuditEventValues } from "../utils/audit";
import { batchWriteMissed, insertAuditEventWhere } from "../utils/guarded-writes";
import { getSessionUserId } from "../utils/session";
import { buildTeamInviteDelivery } from "../utils/team-invite-delivery";
import { buildInviteRevocation } from "../utils/team-invite-revocation";
import { isTeamSlugTaken, isTeamSlugUniqueViolation, teamSlugInUseError } from "../utils/team-slug";
import {
  canManageTeam,
  getActiveTeamMembership,
  normalizeTeamRole,
} from "../utils/team-access";
import { json, jsonError } from "../utils/response";
import { createTeam } from "./team-create";
import { transferTeamOwnership, updateTeamMember } from "./team-membership";

const updateTeamBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers, and hyphens only")
      .optional(),
  })
  .refine((value) => typeof value.name !== "undefined" || typeof value.slug !== "undefined", {
    message: "No fields to update",
  });

const inviteTeamMemberBodySchema = z.object({
  // Stored lowercase so invite lookups can use plain equality on the email index.
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(["admin", "editor", "runner", "viewer"]).default("viewer"),
});

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function getCurrentUserEmail(env: Env, userId: string): Promise<string | null> {
  const db = createDb(env);
  const { users } = schema;

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.email ?? null;
}

function parseOptionalJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isInvitePending(invite: {
  accepted_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
}): boolean {
  if (invite.accepted_at || invite.revoked_at) return false;
  if (!invite.expires_at) return false;
  return Date.parse(invite.expires_at) > Date.now();
}

function pendingInviteWhere(inviteId: string, now: string) {
  const { team_invites } = schema;

  return and(
    eq(team_invites.id, inviteId),
    isNull(team_invites.accepted_at),
    isNull(team_invites.revoked_at),
    gt(team_invites.expires_at, now),
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

async function acceptTeamInviteRecord({
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
    return jsonError("Invite is for a different email address", 403);
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

  if (Date.parse(invite.expires_at) <= Date.now()) {
    return jsonError("Invite expired", 410);
  }

  const now = new Date().toISOString();
  const inviteRole = normalizeTeamRole(invite.role, "viewer");
  const memberId = existingMembership?.id ?? crypto.randomUUID();
  let finalRole = inviteRole;
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
    after: { inviteId: invite.id, memberId, role: finalRole },
    request,
    createdAt: now,
  });

  if (existingMembership) {
    if (existingMembership.status === "active") {
      finalRole = normalizeTeamRole(existingMembership.role);
      const acceptedAuditEvent = await buildAuditEventValues({
        actorUserId: userId,
        subject: { type: "team", id: invite.team_id },
        resource: { type: "team_invite", id: invite.id },
        action: "team_invite.accepted",
        after: { inviteId: invite.id, memberId, role: finalRole },
        request,
        createdAt: now,
      });
      await db.batch([
        db.update(team_invites).set(inviteUpdates).where(pendingInviteWhere(invite.id, now)),
        insertAuditEventWhere(db, acceptedAuditEvent, acceptedInviteExistsSql(invite.id, userId, now)),
      ]);
    } else {
      await db.batch([
        db.update(team_invites).set(inviteUpdates).where(pendingInviteWhere(invite.id, now)),
        db.update(team_members).set({
          role: inviteRole,
          status: "active",
          joined_at: existingMembership.joined_at ?? now,
          updated_at: now,
        }).where(and(eq(team_members.id, memberId), acceptedInviteExistsSql(invite.id, userId, now))),
        insertAuditEventWhere(db, auditEvent, acceptedInviteExistsSql(invite.id, userId, now)),
      ]);
    }
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
      db.update(team_invites).set(inviteUpdates).where(pendingInviteWhere(invite.id, now)),
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

  const acceptedRole = normalizeTeamRole(acceptedMembership.role, finalRole);
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

export async function handleTeams(request: Request, env: Env): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const teamsSubpath = pathParts.slice(2);
  const db = createDb(env);
  const { audit_events, team_invites, team_members, teams, users } = schema;

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
    return createTeam({ db, request, userId }, await readJson(request));
  }

  if (request.method === "POST" && teamsSubpath[0] === "invites" && teamsSubpath[2] === "accept") {
    const token = teamsSubpath[1];
    if (!token) {
      return jsonError("Invite token required", 400);
    }

    const tokenHash = await sha256Hex(token);
    if (!tokenHash) {
      return jsonError("Unable to verify invite token", 500);
    }

    const [invite] = await db.select().from(team_invites).where(eq(team_invites.token_hash, tokenHash)).limit(1);
    if (!invite) {
      return jsonError("Invite not found", 404);
    }

    return acceptTeamInviteRecord({ db, env, invite, request, userId });
  }

  if (request.method === "GET" && teamsSubpath[0] === "invites" && teamsSubpath[1] === "pending" && teamsSubpath.length === 2) {
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
        ),
      )
      .orderBy(desc(team_invites.created_at));

    return json(rows);
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

  if (request.method === "GET" && teamsSubpath.length === 1) {
    const [team] = await db.select().from(teams).where(and(eq(teams.id, teamId), isNull(teams.archived_at))).limit(1);
    if (!team) {
      return jsonError("Organization not found", 404);
    }

    return json({ ...team, membership: { id: membership.id, role, status: membership.status } });
  }

  if (request.method === "PUT" && teamsSubpath.length === 1) {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    const body = await readJson(request);
    const parsed = updateTeamBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "Invalid Organization payload", 400);
    }

    const [team] = await db.select().from(teams).where(and(eq(teams.id, teamId), isNull(teams.archived_at))).limit(1);
    if (!team) {
      return jsonError("Organization not found", 404);
    }

    const updates: {
      name?: string;
      slug?: string;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (typeof parsed.data.name === "string" && parsed.data.name !== team.name) {
      updates.name = parsed.data.name;
    }

    if (typeof parsed.data.slug === "string" && parsed.data.slug !== team.slug) {
      if (await isTeamSlugTaken(db, parsed.data.slug, teamId)) {
        return teamSlugInUseError();
      }

      updates.slug = parsed.data.slug;
    }

    const membershipSummary = { id: membership.id, role, status: membership.status };
    if (Object.keys(updates).length === 1) {
      // Saving the current values (for example, after trimming) changes nothing to write or audit.
      return json({ success: true, team: { ...team, membership: membershipSummary } });
    }

    const auditEvent = await buildAuditEventValues({
      actorUserId: userId,
      subject: { type: "team", id: teamId },
      resource: { type: "team", id: teamId },
      action: "team.updated",
      before: team,
      after: { ...team, ...updates },
      diff: updates,
      request,
      createdAt: updates.updated_at,
    });
    try {
      await db.batch([
        db.update(teams).set(updates).where(and(eq(teams.id, teamId), isNull(teams.archived_at))),
        db.insert(audit_events).values(auditEvent),
      ]);
    } catch (error) {
      // Another Organization can save the same slug between the check above and this write.
      if (updates.slug && isTeamSlugUniqueViolation(error)) {
        return teamSlugInUseError();
      }
      throw error;
    }

    return json({
      success: true,
      team: {
        ...team,
        ...updates,
        membership: membershipSummary,
      },
    });
  }

  if (request.method === "GET" && teamsSubpath[1] === "members") {
    const memberListWhere = canManageTeam(role)
      ? eq(team_members.team_id, teamId)
      : and(eq(team_members.team_id, teamId), eq(team_members.status, "active"));

    const rows = await db
      .select({
        id: team_members.id,
        team_id: team_members.team_id,
        user_id: team_members.user_id,
        role: team_members.role,
        status: team_members.status,
        joined_at: team_members.joined_at,
        created_at: team_members.created_at,
        updated_at: team_members.updated_at,
        email: users.email,
        name: users.name,
        avatar_url: users.avatar_url,
      })
      .from(team_members)
      .leftJoin(users, eq(users.id, team_members.user_id))
      .where(memberListWhere)
      .orderBy(desc(team_members.created_at));

    return json(rows);
  }

  if (request.method === "PUT" && teamsSubpath[1] === "owner") {
    if (role !== "owner") {
      return jsonError("Only the Organization owner can transfer ownership", 403, {
        code: "owner_required",
      });
    }

    return transferTeamOwnership({ db, request, teamId, userId, membership }, await readJson(request));
  }

  if (request.method === "GET" && teamsSubpath[1] === "activity") {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
    const activityLimit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
      : 50;
    const rows = await db
      .select({
        id: audit_events.id,
        actor_user_id: audit_events.actor_user_id,
        resource_type: audit_events.resource_type,
        resource_id: audit_events.resource_id,
        action: audit_events.action,
        metadata_json: audit_events.metadata_json,
        request_id: audit_events.request_id,
        created_at: audit_events.created_at,
        actorEmail: users.email,
        actorName: users.name,
        actorUsername: users.username,
      })
      .from(audit_events)
      .leftJoin(users, eq(users.id, audit_events.actor_user_id))
      .where(and(eq(audit_events.subject_type, "team"), eq(audit_events.subject_id, teamId)))
      .orderBy(desc(audit_events.created_at))
      .limit(activityLimit);

    return json(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        resource: {
          type: row.resource_type,
          id: row.resource_id,
        },
        metadata: parseOptionalJson(row.metadata_json),
        requestId: row.request_id,
        createdAt: row.created_at,
        actor: {
          userId: row.actor_user_id,
          email: row.actorEmail,
          name: row.actorName,
          username: row.actorUsername,
        },
      })),
    );
  }

  if (request.method === "GET" && teamsSubpath[1] === "invites") {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    const now = new Date().toISOString();
    const rows = await db
      .select({
        id: team_invites.id,
        team_id: team_invites.team_id,
        email: team_invites.email,
        role: team_invites.role,
        invited_by_user_id: team_invites.invited_by_user_id,
        expires_at: team_invites.expires_at,
        created_at: team_invites.created_at,
        updated_at: team_invites.updated_at,
        inviterEmail: users.email,
        inviterName: users.name,
      })
      .from(team_invites)
      .leftJoin(users, eq(users.id, team_invites.invited_by_user_id))
      .where(
        and(
          eq(team_invites.team_id, teamId),
          isNull(team_invites.accepted_at),
          isNull(team_invites.revoked_at),
          gt(team_invites.expires_at, now),
        ),
      )
      .orderBy(desc(team_invites.created_at));

    return json(rows);
  }

  if (request.method === "POST" && teamsSubpath[1] === "invites") {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    const body = await readJson(request);
    const parsed = inviteTeamMemberBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "Invalid invite payload", 400);
    }

    const inviteEmail = parsed.data.email;
    const now = new Date().toISOString();
    const [existingActiveMember] = await db
      .select({ id: team_members.id })
      .from(team_members)
      .leftJoin(users, eq(users.id, team_members.user_id))
      .where(
        and(
          eq(team_members.team_id, teamId),
          eq(team_members.status, "active"),
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
        id: team_invites.id,
        expires_at: team_invites.expires_at,
      })
      .from(team_invites)
      .where(
        and(
          eq(team_invites.team_id, teamId),
          eq(team_invites.email, inviteEmail),
          isNull(team_invites.accepted_at),
          isNull(team_invites.revoked_at),
          gt(team_invites.expires_at, now),
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
      db.insert(team_invites).values(invite),
      db.insert(audit_events).values(auditEvent),
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

  if (request.method === "DELETE" && teamsSubpath[1] === "invites" && teamsSubpath[2]) {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    const inviteId = teamsSubpath[2];
    const now = new Date().toISOString();
    const [invite] = await db
      .select()
      .from(team_invites)
      .where(
        and(
          eq(team_invites.id, inviteId),
          eq(team_invites.team_id, teamId),
          isNull(team_invites.accepted_at),
          isNull(team_invites.revoked_at),
          gt(team_invites.expires_at, now),
        ),
      )
      .limit(1);

    if (!invite || !isInvitePending(invite)) {
      return jsonError("Invite not found", 404);
    }

    // The invite can be accepted or revoked by someone else before this batch runs; the
    // revoke and its audit event then do nothing, and the response says what happened.
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
        .select({ accepted_at: team_invites.accepted_at })
        .from(team_invites)
        .where(and(eq(team_invites.id, inviteId), eq(team_invites.team_id, teamId)))
        .limit(1);
      return current?.accepted_at
        ? jsonError("Invite was already accepted", 409, { code: "invite_already_accepted" })
        : jsonError("Invite not found", 404);
    }

    return json({ success: true });
  }

  if (request.method === "PUT" && teamsSubpath[1] === "members" && teamsSubpath[2]) {
    if (!canManageTeam(role)) {
      return jsonError("Forbidden", 403);
    }

    return updateTeamMember({ db, request, teamId, userId, membership }, teamsSubpath[2], await readJson(request));
  }

  return new Response("Method Not Allowed", { status: 405 });
}
