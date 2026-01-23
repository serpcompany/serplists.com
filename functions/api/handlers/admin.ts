import type { Env } from "../types";
import { createDb, schema } from "../db";
import { json, jsonError } from "../utils/response";
import { eq } from "drizzle-orm";

function hasValidAdminSecret(request: Request, env: Env): boolean {
  if (!env.ENTITLEMENTS_ADMIN_SECRET) return false;
  const provided = request.headers.get("X-Admin-Secret");
  if (!provided) return false;
  return provided === env.ENTITLEMENTS_ADMIN_SECRET;
}

export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean); // ["api", "admin", ...]
  const adminSubpath = pathParts.slice(2); // after /api/admin

  if (!hasValidAdminSecret(request, env)) {
    return jsonError("Unauthorized", 401);
  }

  // POST /api/admin/entitlements/override
  if (request.method === "POST" && adminSubpath[0] === "entitlements" && adminSubpath[1] === "override") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON payload", 400);
    }

    const userId = typeof body?.userId === "string" ? body.userId : null;
    const email = typeof body?.email === "string" ? body.email : null;
    const plan = typeof body?.plan === "string" ? body.plan : "pro";
    const expiresAt = typeof body?.expiresAt === "number" ? body.expiresAt : null; // unix seconds
    const note = typeof body?.note === "string" ? body.note : null;

    if (!userId && !email) {
      return jsonError("userId or email required", 400);
    }
    if (plan !== "pro" && plan !== "free") {
      return jsonError("plan must be 'pro' or 'free'", 400);
    }

    const db = createDb(env);
    const { entitlement_overrides, users } = schema;
    const nowIso = new Date().toISOString();

    const resolvedUserId = userId
      ? userId
      : (
          await db.select({ id: users.id }).from(users).where(eq(users.email, email!)).limit(1)
        )[0]?.id ?? null;

    if (!resolvedUserId) {
      return jsonError("User not found", 404);
    }

    try {
      await db.insert(entitlement_overrides).values({
        user_id: resolvedUserId,
        plan,
        expires_at: expiresAt,
        note,
        created_at: nowIso,
        updated_at: nowIso,
      });
    } catch {
      await db
        .update(entitlement_overrides)
        .set({ plan, expires_at: expiresAt, note, updated_at: nowIso })
        .where(eq(entitlement_overrides.user_id, resolvedUserId));
    }

    return json({ success: true, userId: resolvedUserId, plan, expiresAt });
  }

  // DELETE /api/admin/entitlements/override?userId=...
  if (request.method === "DELETE" && adminSubpath[0] === "entitlements" && adminSubpath[1] === "override") {
    const userId = url.searchParams.get("userId");
    if (!userId) return jsonError("userId required", 400);

    const db = createDb(env);
    const { entitlement_overrides } = schema;
    await db.delete(entitlement_overrides).where(eq(entitlement_overrides.user_id, userId));
    return json({ success: true });
  }

  return jsonError("Not Found", 404);
}

