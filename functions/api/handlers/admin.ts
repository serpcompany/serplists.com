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
  .refine((body) => body.userId !== undefined || body.email !== undefined, {
    message: "userId or email required",
  });

const sha256 = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

async function hasValidAdminSecret(request: Request, env: Env): Promise<boolean> {
  if (!env.ENTITLEMENTS_ADMIN_SECRET) return false;
  const provided = request.headers.get("X-Admin-Secret");
  if (!provided) return false;
  const [expected, actual] = await Promise.all([sha256(env.ENTITLEMENTS_ADMIN_SECRET), sha256(provided)]);
  let difference = expected.length === actual.length ? 0 : 1;
  expected.forEach((byte, index) => {
    difference |= byte ^ (actual[index] ?? 0);
  });
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
  const { userId, email, plan, expiresAt } = read.payload;
  const note = read.payload.note ?? null;

  const db = createDb(env);
  const idFromUserId = userId === undefined ? undefined : await findUserIdById(db, userId);
  const idFromEmail = email === undefined ? undefined : await findUserIdByEmail(db, email);
  if (idFromUserId === null || idFromEmail === null) {
    return jsonError("User not found", 404);
  }
  if (idFromUserId !== undefined && idFromEmail !== undefined && idFromUserId !== idFromEmail) {
    return jsonError("userId and email belong to different users", 400);
  }
  const resolvedUserId = idFromUserId ?? idFromEmail;
  if (resolvedUserId === undefined) return jsonError("userId or email required", 400);

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
