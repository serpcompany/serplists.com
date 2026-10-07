import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { schema } from "../db";
import { buildAuditEventValues } from "../utils/audit";
import { isTeamSlugTaken, isTeamSlugUniqueViolation, teamSlugInUseError } from "../utils/team-slug";
import { publicHandleSchema } from "../../../src/lib/schemas/publicHandle";
import { ORGANIZATION_DESCRIPTION_MAX } from "../../../src/lib/schemas/nameLimits";
import { resolveTrustedOrigins } from "../utils/cors";
import { buildUserProfileWritePolicy, uploadedAvatarUrlError } from "../utils/user-profile-validation";
import { canManageTeam, findActiveTeam, type TeamRole } from "../utils/team-access";
import { json, jsonError } from "../utils/response";
import { invalidPayloadResponse } from "../utils/request-json";
import { findHiddenShareLinkActors, HIDDEN_ACTOR } from "../utils/share-link-actors";
import type { TeamRouteContext } from "./team-membership";

const updateTeamBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().optional(),
    description: z
      .string()
      .trim()
      .max(ORGANIZATION_DESCRIPTION_MAX, `Description must be ${ORGANIZATION_DESCRIPTION_MAX} characters or fewer.`)
      .nullable()
      .optional(),
    avatar_url: z.string().trim().nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => typeof field !== "undefined"), {
    message: "No fields to update",
  });

function parseOptionalJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function updateTeamSettings(
  { db, env, request, teamId, userId, membership, role }: TeamRouteContext & { env: Env; role: TeamRole },
  body: unknown,
): Promise<Response> {
  const { auditEvents, teams } = schema;

  const parsed = updateTeamBodySchema.safeParse(body);
  if (!parsed.success) {
    return invalidPayloadResponse(parsed.error, "Invalid Organization payload");
  }

  const team = await findActiveTeam(db, teamId);
  if (!team) {
    return jsonError("Organization not found", 404);
  }

  const updates: {
    name?: string;
    slug?: string;
    description?: string | null;
    avatar_url?: string | null;
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (typeof parsed.data.name === "string" && parsed.data.name !== team.name) {
    updates.name = parsed.data.name;
  }

  if (typeof parsed.data.slug === "string" && parsed.data.slug !== team.slug) {
    const slug = publicHandleSchema.safeParse(parsed.data.slug);
    if (!slug.success) {
      return jsonError(`slug: ${slug.error.issues[0]?.message ?? "Invalid slug"}`, 400);
    }
    if (await isTeamSlugTaken(db, parsed.data.slug, teamId)) {
      return teamSlugInUseError();
    }

    updates.slug = parsed.data.slug;
  }

  if (parsed.data.description !== undefined) {
    const description = parsed.data.description || null;
    if (description !== (team.description ?? null)) updates.description = description;
  }

  if (parsed.data.avatar_url !== undefined) {
    const avatarUrl = parsed.data.avatar_url || null;
    const avatarError = avatarUrl
      ? uploadedAvatarUrlError(avatarUrl, buildUserProfileWritePolicy(env, resolveTrustedOrigins(request, env)))
      : null;
    if (avatarError) {
      return jsonError(`avatar_url: ${avatarError}`, 400);
    }
    if (avatarUrl !== (team.avatar_url ?? null)) updates.avatar_url = avatarUrl;
  }

  const membershipSummary = { id: membership.id, role, status: membership.status };
  const changesNothing = Object.keys(updates).every((field) => field === "updated_at");
  if (changesNothing) {
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
      db.insert(auditEvents).values(auditEvent),
    ]);
  } catch (error) {
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

export async function listTeamMembers(
  { db, teamId, role }: { db: TeamRouteContext["db"]; teamId: string; role: TeamRole },
): Promise<Response> {
  const { teamMembers, users } = schema;

  const memberListWhere = canManageTeam(role)
    ? eq(teamMembers.team_id, teamId)
    : and(eq(teamMembers.team_id, teamId), eq(teamMembers.status, "active"));

  const rows = await db
    .select({
      id: teamMembers.id,
      team_id: teamMembers.team_id,
      user_id: teamMembers.user_id,
      role: teamMembers.role,
      status: teamMembers.status,
      joined_at: teamMembers.joined_at,
      created_at: teamMembers.created_at,
      updated_at: teamMembers.updated_at,
      email: users.email,
      name: users.name,
      avatar_url: users.avatar_url,
    })
    .from(teamMembers)
    .leftJoin(users, eq(users.id, teamMembers.user_id))
    .where(memberListWhere)
    .orderBy(desc(teamMembers.created_at));

  return json(rows);
}

export async function listTeamActivity(
  { db, env, teamId }: { db: TeamRouteContext["db"]; env: Env; teamId: string },
  url: URL,
): Promise<Response> {
  const { auditEvents, users } = schema;

  const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
  const activityLimit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 50;
  const rows = await db
    .select({
      id: auditEvents.id,
      actor_user_id: auditEvents.actor_user_id,
      resource_type: auditEvents.resource_type,
      resource_id: auditEvents.resource_id,
      action: auditEvents.action,
      metadata_json: auditEvents.metadata_json,
      request_id: auditEvents.request_id,
      created_at: auditEvents.created_at,
      actorEmail: users.email,
      actorName: users.name,
      actorUsername: users.username,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actor_user_id))
    .where(and(eq(auditEvents.subject_type, "team"), eq(auditEvents.subject_id, teamId)))
    .orderBy(desc(auditEvents.created_at))
    .limit(activityLimit);
  const hideActor = await findHiddenShareLinkActors(env, { userId: null, teamId }, rows);

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
      actor: hideActor(row) ? HIDDEN_ACTOR : {
        userId: row.actor_user_id,
        email: row.actorEmail,
        name: row.actorName,
        username: row.actorUsername,
      },
    })),
  );
}
