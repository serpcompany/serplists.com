import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema, type createDb } from "../db";
import { jsonError } from "./response";
import { isPublicHandleUniqueViolation } from "./public-handle";
import { generateSlug, truncateSlug, withSlugSuffix } from "./slug";
import { isUniqueViolationOn } from "./unique-violation";
import { normalizePublicHandle } from "../../../src/lib/schemas/publicHandle";
import { TEAM_SLUG_MAX } from "../../../src/lib/schemas/templateLimits";

type Db = ReturnType<typeof createDb>;

export const teamSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(TEAM_SLUG_MAX)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase letters, numbers, and hyphens only");

export async function isTeamSlugTaken(db: Db, slug: string, exceptTeamId?: string): Promise<boolean> {
  const { publicHandles } = schema;
  const [holder] = await db
    .select({ ownerType: publicHandles.owner_type, ownerId: publicHandles.owner_id })
    .from(publicHandles)
    .where(eq(publicHandles.handle, normalizePublicHandle(slug)))
    .limit(1);
  if (!holder) return false;
  return !(holder.ownerType === "team" && holder.ownerId === exceptTeamId);
}

export function teamSlugInUseError(): Response {
  return jsonError("Organization slug is already in use", 409, { code: "team_slug_exists" });
}

export function isTeamSlugUniqueViolation(error: unknown): boolean {
  return isUniqueViolationOn(error, "teams.slug") || isPublicHandleUniqueViolation(error);
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
