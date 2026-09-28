// Organization slugs. idx_teams_slug_unique covers every row with a slug, archived
// Organizations included, so "taken" means any row, not only active ones.
import { eq } from "drizzle-orm";
import { schema, type createDb } from "../db";
import { jsonError } from "./response";
import { generateSlug } from "./slug";

type Db = ReturnType<typeof createDb>;

// The create and update schemas accept slugs up to this length.
const MAX_TEAM_SLUG_LENGTH = 120;
const TEAM_SLUG_UNIQUE_VIOLATION = /unique constraint failed:[^:]*\bteams\.slug\b/i;

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
 * True when `error`, or an error it wraps, is idx_teams_slug_unique rejecting a write:
 * another request saved the slug between this request's check and its batch. Other
 * unique indexes and other failures are not slug conflicts.
 */
export function isTeamSlugUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (TEAM_SLUG_UNIQUE_VIOLATION.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

/** The slug an Organization name maps to, or team-<id8> when the name has no usable characters. */
export function teamSlugBase(name: string, teamId: string): string {
  return generateSlug(name) || `team-${teamId.slice(0, 8)}`;
}

/** `base-suffix`, with `base` shortened so the result stays within the slug length limit. */
export function suffixTeamSlug(base: string, suffix: string): string {
  const room = MAX_TEAM_SLUG_LENGTH - suffix.length - 1;
  return `${base.slice(0, room).replace(/-+$/, "")}-${suffix}`;
}

/**
 * A free slug derived from the Organization name. A slug the caller asked for is never
 * passed here: it is used as given or refused with teamSlugInUseError().
 */
export async function generateUniqueTeamSlug(db: Db, base: string, teamId: string): Promise<string> {
  if (!(await isTeamSlugTaken(db, base))) return base;

  const suffixed = suffixTeamSlug(base, teamId.slice(0, 8));
  if (!(await isTeamSlugTaken(db, suffixed))) return suffixed;

  return suffixTeamSlug(base, crypto.randomUUID().slice(0, 8));
}
