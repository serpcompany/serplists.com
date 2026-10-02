import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema, type createDb } from "../db";
import { jsonError } from "./response";
import { generateSlug, truncateSlug, withSlugSuffix } from "./slug";
import { isUniqueViolationOn } from "./unique-violation";
import { TEAM_SLUG_MAX } from "../../../src/lib/schemas/templateLimits";

type Db = ReturnType<typeof createDb>;

export const teamSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(TEAM_SLUG_MAX)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers, and hyphens only");

export async function isTeamSlugTaken(db: Db, slug: string, exceptTeamId?: string): Promise<boolean> {
  const { teams } = schema;
  const [existing] = await db.select({ id: teams.id }).from(teams).where(eq(teams.slug, slug)).limit(1);
  return existing !== undefined && existing.id !== exceptTeamId;
}

export function teamSlugInUseError(): Response {
  return jsonError("Organization slug is already in use", 409, { code: "team_slug_exists" });
}

export function isTeamSlugUniqueViolation(error: unknown): boolean {
  return isUniqueViolationOn(error, "teams.slug");
}

export function teamSlugBase(name: string, teamId: string): string {
  return truncateSlug(generateSlug(name), TEAM_SLUG_MAX) || `team-${teamId.slice(0, 8)}`;
}

export function suffixTeamSlug(base: string, suffix: string): string {
  return withSlugSuffix(base, suffix, TEAM_SLUG_MAX);
}

export async function generateUniqueTeamSlug(db: Db, base: string, teamId: string): Promise<string> {
  if (!(await isTeamSlugTaken(db, base))) return base;

  const suffixed = suffixTeamSlug(base, teamId.slice(0, 8));
  if (!(await isTeamSlugTaken(db, suffixed))) return suffixed;

  return suffixTeamSlug(base, crypto.randomUUID().slice(0, 8));
}
