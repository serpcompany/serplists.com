// Organization slugs. idx_teams_slug_unique covers every row with a slug, archived
// Organizations included, so "taken" means any row, not only active ones.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema, type createDb } from "../db";
import { jsonError } from "./response";
import { generateSlug, truncateSlug, withSlugSuffix } from "./slug";
import { TEAM_SLUG_MAX } from "../../../src/lib/schemas/templateLimits";

type Db = ReturnType<typeof createDb>;

/**
 * A slug the caller types, on create or when PUT changes it. Settings resends the stored
 * slug, which can predate these rules, so PUT checks it only when it changes.
 */
export const teamSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(TEAM_SLUG_MAX)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers, and hyphens only");

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
  return truncateSlug(generateSlug(name), TEAM_SLUG_MAX) || `team-${teamId.slice(0, 8)}`;
}

/** `base-suffix`, with `base` shortened so the result stays within TEAM_SLUG_MAX. */
export function suffixTeamSlug(base: string, suffix: string): string {
  return withSlugSuffix(base, suffix, TEAM_SLUG_MAX);
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
