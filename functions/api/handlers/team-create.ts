// Organization creation (POST /api/teams). The slug is checked with a SELECT and written
// in a later batch, so another request can take it in between. idx_teams_slug_unique then
// fails the batch, which D1 rolls back as a whole: a slug derived from the name is retried
// with a new suffix, and a slug the caller asked for is refused with 409.
import { z } from "zod";
import { schema, type createDb } from "../db";
import { buildAuditEventValues } from "../utils/audit";
import { json, jsonError } from "../utils/response";
import {
  generateUniqueTeamSlug,
  isTeamSlugTaken,
  isTeamSlugUniqueViolation,
  suffixTeamSlug,
  teamSlugBase,
  teamSlugInUseError,
  teamSlugSchema,
} from "../utils/team-slug";

const createTeamBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: teamSlugSchema.optional(),
});

const MAX_CREATE_ATTEMPTS = 3;

export async function createTeam(
  context: { db: ReturnType<typeof createDb>; request: Request; userId: string },
  body: unknown,
): Promise<Response> {
  const { db, request, userId } = context;
  const { audit_events, team_members, teams } = schema;

  const parsed = createTeamBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid Organization payload", 400);
  }

  const now = new Date().toISOString();
  const teamId = crypto.randomUUID();
  // A slug the caller typed is used as given or refused, like PUT; only a slug derived
  // from the name gets a suffix when taken.
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
    // Rebuilt on every attempt so the audit row records the slug that was written.
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
        db.insert(team_members).values(membership),
        db.insert(audit_events).values(auditEvent),
      ]);
    } catch (error) {
      if (!isTeamSlugUniqueViolation(error)) throw error;
      if (requestedSlug) return teamSlugInUseError();
      if (attempt >= MAX_CREATE_ATTEMPTS) {
        return jsonError("Could not reserve an Organization slug. Try again.", 409, { code: "team_slug_exists" });
      }
      // The failed batch wrote nothing, so the same ids are reused with a new random suffix.
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
