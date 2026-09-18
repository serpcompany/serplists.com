import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import { createPersonalRunKeySecret } from "../utils/personal-run-key";
import { json, jsonError } from "../utils/response";
import { getSessionUserId } from "../utils/session";

const createKeyBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name must be 80 characters or fewer"),
});

const safeKeySelection = (personal_run_keys: typeof schema.personal_run_keys) => ({
  id: personal_run_keys.id,
  name: personal_run_keys.name,
  prefix: personal_run_keys.key_prefix,
  createdAt: personal_run_keys.created_at,
  lastUsedAt: personal_run_keys.last_used_at,
  revokedAt: personal_run_keys.revoked_at,
});

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleAgentKeys(request: Request, env: Env): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  if (!userId) return jsonError("Unauthorized", 401);

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const handlerPath = pathParts[0] === "api" ? pathParts.slice(1) : pathParts;
  if (handlerPath[0] !== "agent-keys" || handlerPath.length > 2) {
    return jsonError("Not found", 404);
  }
  const keyId = handlerPath[1];
  const db = createDb(env);
  const { personal_run_keys } = schema;

  if (request.method === "GET" && !keyId) {
    const keys = await db
      .select(safeKeySelection(personal_run_keys))
      .from(personal_run_keys)
      .where(eq(personal_run_keys.user_id, userId))
      .orderBy(desc(personal_run_keys.created_at));
    return json(keys.map((key) => ({
      ...key,
      status: key.revokedAt ? "revoked" : "active",
    })));
  }

  if (request.method === "POST" && !keyId) {
    const parsed = createKeyBodySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid key payload", 400);
    }

    let secret: Awaited<ReturnType<typeof createPersonalRunKeySecret>>;
    try {
      secret = await createPersonalRunKeySecret();
    } catch {
      return jsonError("Unable to create personal run key", 500);
    }

    const record = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: parsed.data.name,
      key_prefix: secret.keyPrefix,
      key_hash: secret.keyHash,
      created_at: new Date().toISOString(),
      last_used_at: null,
      revoked_at: null,
    };

    await db.insert(personal_run_keys).values(record);
    const response = json({
      key: {
        id: record.id,
        name: record.name,
        prefix: record.key_prefix,
        createdAt: record.created_at,
        lastUsedAt: record.last_used_at,
        revokedAt: record.revoked_at,
        status: "active",
      },
      secret: secret.key,
    }, 201);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Pragma", "no-cache");
    return response;
  }

  if (request.method === "DELETE" && keyId) {
    const [ownedKey] = await db
      .select({ id: personal_run_keys.id })
      .from(personal_run_keys)
      .where(and(
        eq(personal_run_keys.id, keyId),
        eq(personal_run_keys.user_id, userId),
        isNull(personal_run_keys.revoked_at),
      ))
      .limit(1);
    if (!ownedKey) return jsonError("Personal run key not found", 404);

    const revokedAt = new Date().toISOString();
    await db
      .update(personal_run_keys)
      .set({ revoked_at: revokedAt })
      .where(and(
        eq(personal_run_keys.id, keyId),
        eq(personal_run_keys.user_id, userId),
        isNull(personal_run_keys.revoked_at),
      ));
    return json({ id: keyId, revokedAt });
  }

  return jsonError("Not found", 404);
}
