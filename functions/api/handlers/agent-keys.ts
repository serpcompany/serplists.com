import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import { resolveAgentMcpConnection } from "../utils/agent-mcp-host";
import { createPersonalRunKeySecret } from "../utils/personal-run-key";
import { json, jsonError } from "../utils/response";
import { getSessionUserId } from "../utils/session";

// GET /api/agent-keys/connection. Key ids are UUIDs, so this segment never names a key.
const CONNECTION_PATH = "connection";

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

  if (request.method === "GET" && keyId === CONNECTION_PATH) {
    return json(resolveAgentMcpConnection(request, env));
  }

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
    const ownedKey = and(eq(personal_run_keys.id, keyId), eq(personal_run_keys.user_id, userId));
    const [revoked] = await db
      .update(personal_run_keys)
      .set({ revoked_at: new Date().toISOString() })
      .where(and(ownedKey, isNull(personal_run_keys.revoked_at)))
      .returning({ revokedAt: personal_run_keys.revoked_at });
    if (revoked?.revokedAt) return json({ id: keyId, revokedAt: revoked.revokedAt });

    // Already revoked (in another tab, or a retry after a lost response): report the stored
    // time rather than a new one. A missing key and another user's key get the same 404.
    const [existing] = await db
      .select({ revokedAt: personal_run_keys.revoked_at })
      .from(personal_run_keys)
      .where(ownedKey)
      .limit(1);
    if (!existing?.revokedAt) return jsonError("Personal run key not found", 404);
    return json({ id: keyId, revokedAt: existing.revokedAt });
  }

  return jsonError("Not found", 404);
}
