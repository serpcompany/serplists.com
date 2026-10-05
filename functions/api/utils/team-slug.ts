import { eq } from "drizzle-orm";
import { schema, type createDb } from "../db";
import { jsonError } from "./response";
import { isPublicHandleUniqueViolation } from "./public-handle";
import { generateSlug, truncateSlug, withSlugSuffix } from "./slug";
import { isUniqueViolationOn } from "./unique-violation";
import {
  normalizePublicHandle,
  PUBLIC_HANDLE_MAX_LENGTH,
  PUBLIC_HANDLE_MIN_LENGTH,
} from "../../../src/lib/schemas/publicHandle";

type Db = ReturnType<typeof createDb>;

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
  const fromName = truncateSlug(generateSlug(name), PUBLIC_HANDLE_MAX_LENGTH);
  return fromName.length >= PUBLIC_HANDLE_MIN_LENGTH ? fromName : `team-${teamId.slice(0, 8)}`;
}

export function suffixTeamSlug(base: string, suffix: string): string {
  return withSlugSuffix(base, suffix, PUBLIC_HANDLE_MAX_LENGTH);
}

export async function generateUniqueTeamSlug(db: Db, base: string, teamId: string): Promise<string> {
  if (!(await isTeamSlugTaken(db, base))) return base;

  const suffixed = suffixTeamSlug(base, teamId.slice(0, 8));
  if (!(await isTeamSlugTaken(db, suffixed))) return suffixed;

  return suffixTeamSlug(base, crypto.randomUUID().slice(0, 8));
}
