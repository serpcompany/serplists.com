import { z } from "zod";
import { schema, type createDb } from "../db";
import { buildAuditEventValues } from "../utils/audit";
import { json, jsonError } from "../utils/response";
import { invalidPayloadResponse } from "../utils/request-json";
import {
  generateUniqueTeamSlug,
  isTeamSlugTaken,
  isTeamSlugUniqueViolation,
  suffixTeamSlug,
  teamSlugBase,
  teamSlugInUseError,
} from "../utils/team-slug";
import { publicHandleSchema } from "../../../src/lib/schemas/publicHandle";

const createTeamBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: publicHandleSchema.optional(),
});

const MAX_CREATE_ATTEMPTS = 3;

export async function createTeam(
  context: { db: ReturnType<typeof createDb>; request: Request; userId: string },
  body: unknown,
): Promise<Response> {
  const { db, request, userId } = context;
  const { auditEvents, teamMembers, teams } = schema;

  const parsed = createTeamBodySchema.safeParse(body);
  if (!parsed.success) {
    return invalidPayloadResponse(parsed.error, "Invalid Organization payload");
  }

  const now = new Date().toISOString();
  const teamId = crypto.randomUUID();
  const requestedSlug = parsed.data.slug;
  if (requestedSlug && (await isTeamSlugTaken(db, requestedSlug))) {
    return teamSlugInUseError();
  }
  const base = teamSlugBase(parsed.data.name, teamId);
  let slug = requestedSlug ?? (await generateUniqueTeamSlug(db, base, teamId));

  const membership = {
    id: crypto.randomUUID(),
    team_id: teamId,
    user_id: userId,
    role: "owner",
    status: "active",
    invited_by_user_id: null,
    joined_at: now,
    created_at: now,
    updated_at: now,
  };

  for (let attempt = 1; ; attempt += 1) {
    const team = {
      id: teamId,
      name: parsed.data.name,
      slug,
      billing_owner_user_id: userId,
      created_by_user_id: userId,
      created_at: now,
      updated_at: now,
      archived_at: null,
    };
    const auditEvent = await buildAuditEventValues({
      actorUserId: userId,
      subject: { type: "team", id: teamId },
      resource: { type: "team", id: teamId },
      action: "team.created",
      after: { team, membership },
      request,
      createdAt: now,
    });

    try {
      await db.batch([
        db.insert(teams).values(team),
        db.insert(teamMembers).values(membership),
        db.insert(auditEvents).values(auditEvent),
      ]);
    } catch (error) {
      if (!isTeamSlugUniqueViolation(error)) throw error;
      if (requestedSlug) return teamSlugInUseError();
      if (attempt >= MAX_CREATE_ATTEMPTS) {
        return jsonError("Could not reserve an Organization slug. Try again.", 409, { code: "team_slug_exists" });
      }
      slug = suffixTeamSlug(base, crypto.randomUUID().slice(0, 8));
      continue;
    }

    return json({
      id: teamId,
      memberId: membership.id,
      membershipStatus: membership.status,
      name: team.name,
      role: "owner",
      slug,
    });
  }
}
