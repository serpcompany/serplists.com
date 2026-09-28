// Organization slugs. idx_teams_slug_unique covers every row with a slug, archived
// Organizations included, so "taken" means any row, not only active ones.
import { eq } from "drizzle-orm";
import { schema, type createDb } from "../db";
import { jsonError } from "./response";
import { generateSlug } from "./slug";

type Db = ReturnType<typeof createDb>;

/** True when an Organization other than `exceptTeamId` already uses `slug`. */
export async function isTeamSlugTaken(db: Db, slug: string, exceptTeamId?: string): Promise<boolean> {
  const { teams } = schema;
  const [existing] = await db.select({ id: teams.id }).from(teams).where(eq(teams.slug, slug)).limit(1);
  return Boolean(existing) && existing.id !== exceptTeamId;
}

/** The response for a slug the caller asked for that another Organization uses. */
export function teamSlugInUseError(): Response {
  return jsonError("Organization slug is already in use", 409, { code: "team_slug_exists" });
}

/**
 * A free slug derived from the Organization name. A slug the caller asked for is never
 * passed here: it is used as given or refused with teamSlugInUseError().
 */
export async function generateUniqueTeamSlug(db: Db, name: string, teamId: string): Promise<string> {
  const base = generateSlug(name) || `team-${teamId.slice(0, 8)}`;
  if (!(await isTeamSlugTaken(db, base))) return base;

  const suffixed = `${base}-${teamId.slice(0, 8)}`;
  if (!(await isTeamSlugTaken(db, suffixed))) return suffixed;

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
