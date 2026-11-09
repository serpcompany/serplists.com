import type { Env } from "../types";
import { createDb, schema } from "../db";
import { json, jsonError } from "../utils/response";
import { readJsonPayload } from "../utils/request-json";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

const MAX_OVERRIDE_SECONDS = 5 * 365 * 24 * 60 * 60;
const EXPIRES_AT_MESSAGE =
  "expiresAt must be a whole number of Unix seconds in the future and at most 5 years away, " +
  "or null (or omitted) for no expiry";

type NamesAUser = { userId: string; email?: string | undefined } | { userId?: undefined; email: string };

const namesAUser = <Body extends { userId?: string | undefined; email?: string | undefined }>(body: Body): body is Body & NamesAUser =>
  body.userId !== undefined || body.email !== undefined;

const overrideBodySchema = z
  .object({
    userId: z.string().trim().min(1, "userId must be a non-empty string").optional(),
    email: z.string().trim().email("email must be an email address").optional(),
    plan: z.enum(["pro", "free"], { message: "plan must be 'pro' or 'free'" }).default("pro"),
    expiresAt: z
      .number({ message: EXPIRES_AT_MESSAGE })
      .int(EXPIRES_AT_MESSAGE)
      .nullable()
      .optional()
      .transform((value) => value ?? null)
      .superRefine((value, ctx) => {
        if (value === null) return;
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (value <= nowSeconds || value > nowSeconds + MAX_OVERRIDE_SECONDS) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: EXPIRES_AT_MESSAGE });
        }
      }),
    note: z.string().max(500, "note must be at most 500 characters").nullable().optional(),
  })
  .refine(namesAUser, { message: "userId or email required" });

const sha256 = async (value: string): Promise<DataView> =>
  new DataView(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

async function hasValidAdminSecret(request: Request, env: Env): Promise<boolean> {
  if (!env.ENTITLEMENTS_ADMIN_SECRET) return false;
  const provided = request.headers.get("X-Admin-Secret");
  if (!provided) return false;
  const [expected, actual] = await Promise.all([sha256(env.ENTITLEMENTS_ADMIN_SECRET), sha256(provided)]);
  let difference = 0;
  for (let offset = 0; offset < expected.byteLength; offset += 1) {
    difference |= expected.getUint8(offset) ^ actual.getUint8(offset);
  }
  return difference === 0;
}

type Db = ReturnType<typeof createDb>;

async function findUserIdById(db: Db, userId: string): Promise<string | null> {
  const { users } = schema;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.id ?? null;
}

async function findUserIdByEmail(db: Db, email: string): Promise<string | null> {
  const { users } = schema;
  const candidates = Array.from(new Set([email, email.toLowerCase()]));
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, candidates))
    .limit(candidates.length);
  return (rows.find((row) => row.email === email) ?? rows[0])?.id ?? null;
}

async function upsertOverride(request: Request, env: Env): Promise<Response> {
  const read = await readJsonPayload(request, overrideBodySchema, "Invalid override payload");
  if ("response" in read) return read.response;
  const { payload } = read;
  const { plan, expiresAt } = payload;
  const note = payload.note ?? null;

  const db = createDb(env);
  const resolvedUserId = payload.userId === undefined
    ? await findUserIdByEmail(db, payload.email)
    : await findUserIdById(db, payload.userId);
  const idFromEmail = payload.userId !== undefined && payload.email !== undefined
    ? await findUserIdByEmail(db, payload.email)
    : undefined;
  if (resolvedUserId === null || idFromEmail === null) {
    return jsonError("User not found", 404);
  }
  if (idFromEmail !== undefined && idFromEmail !== resolvedUserId) {
    return jsonError("userId and email belong to different users", 400);
  }

  const { entitlementOverrides } = schema;
  const nowIso = new Date().toISOString();
  await db
    .insert(entitlementOverrides)
    .values({
      user_id: resolvedUserId,
      plan,
      expires_at: expiresAt,
      note,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .onConflictDoUpdate({
      target: entitlementOverrides.user_id,
      set: { plan, expires_at: expiresAt, note, updated_at: nowIso },
    });

  return json({
    success: true,
    userId: resolvedUserId,
    plan,
    expiresAt,
    expiresAtIso: expiresAt === null ? null : new Date(expiresAt * 1000).toISOString(),
  });
}

async function deleteOverride(env: Env, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  if (!userId) return jsonError("userId required", 400);

  const db = createDb(env);
  const { entitlementOverrides } = schema;
  await db.delete(entitlementOverrides).where(eq(entitlementOverrides.user_id, userId));
  return json({ success: true });
}

const OVERRIDE_METHODS = "POST, DELETE";

export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const adminSubpath = pathParts.slice(2);

  const isOverrideRoute = pathParts[1] === "admin"
    && adminSubpath.length === 2
    && adminSubpath[0] === "entitlements"
    && adminSubpath[1] === "override";
  if (!isOverrideRoute) {
    return jsonError("Not Found", 404);
  }
  if (request.method !== "POST" && request.method !== "DELETE") {
    const response = jsonError("Method Not Allowed", 405);
    response.headers.set("Allow", OVERRIDE_METHODS);
    return response;
  }

  if (!(await hasValidAdminSecret(request, env))) {
    return jsonError("Unauthorized", 401);
  }

  return request.method === "POST" ? upsertOverride(request, env) : deleteOverride(env, url);
}
