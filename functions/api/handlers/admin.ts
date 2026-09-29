import type { Env } from "../types";
import { createDb, schema } from "../db";
import { json, jsonError } from "../utils/response";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

const MAX_OVERRIDE_SECONDS = 5 * 365 * 24 * 60 * 60;
const EXPIRES_AT_MESSAGE =
  "expiresAt must be a whole number of Unix seconds in the future and at most 5 years away, " +
  "or null (or omitted) for no expiry";

// An invalid expiresAt must never become "no expiry": that would grant a
// permanent plan. The upper bound also rejects millisecond timestamps.
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

// Compares SHA-256 digests of both values in full, so the time a check takes says nothing
// about how much of a guess matched or how long the secret is.
async function hasValidAdminSecret(request: Request, env: Env): Promise<boolean> {
  if (!env.ENTITLEMENTS_ADMIN_SECRET) return false;
  const provided = request.headers.get("X-Admin-Secret");
  if (!provided) return false;
  const [expected, actual] = await Promise.all([sha256(env.ENTITLEMENTS_ADMIN_SECRET), sha256(provided)]);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
  return difference === 0;
}

type Db = ReturnType<typeof createDb>;

async function findUserIdById(db: Db, userId: string): Promise<string | null> {
  const { users } = schema;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.id ?? null;
}

// Better Auth stores emails lowercased; an exact match also finds an older
// mixed-case row. Both forms use the users.email index.
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

async function handleOverride(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON payload", 400);
  }

  const parsed = overrideBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid override payload", 400);
  }
  const { userId, email, plan, expiresAt } = parsed.data;
  const note = parsed.data.note ?? null;

  const db = createDb(env);
  const idFromUserId = userId === undefined ? undefined : await findUserIdById(db, userId);
  const idFromEmail = email === undefined ? undefined : await findUserIdByEmail(db, email);
  if (idFromUserId === null || idFromEmail === null) {
    return jsonError("User not found", 404);
  }
  if (idFromUserId !== undefined && idFromEmail !== undefined && idFromUserId !== idFromEmail) {
    return jsonError("userId and email belong to different users", 400);
  }
  const resolvedUserId = (idFromUserId ?? idFromEmail) as string;

  const { entitlement_overrides } = schema;
  const nowIso = new Date().toISOString();
  await db
    .insert(entitlement_overrides)
    .values({
      user_id: resolvedUserId,
      plan,
      expires_at: expiresAt,
      note,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .onConflictDoUpdate({
      target: entitlement_overrides.user_id,
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

const OVERRIDE_METHODS = "POST, DELETE";

export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean); // ["api", "admin", ...]
  const adminSubpath = pathParts.slice(2); // after /api/admin

  // The route and method are matched before the secret is read, so a request the endpoint
  // does not serve (a GET, an unknown path) answers the same for a right and a wrong secret.
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

  // POST /api/admin/entitlements/override
  if (request.method === "POST") {
    return handleOverride(request, env);
  }

  // DELETE /api/admin/entitlements/override?userId=...
  const userId = url.searchParams.get("userId");
  if (!userId) return jsonError("userId required", 400);

  const db = createDb(env);
  const { entitlement_overrides } = schema;
  await db.delete(entitlement_overrides).where(eq(entitlement_overrides.user_id, userId));
  return json({ success: true });
}
