import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { parseStoredRunKeyPermissions, type RunKeyPermission } from "../../../src/lib/schemas/runKeyPermissions";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import { sha256Hex } from "./crypto";

const PERSONAL_RUN_KEY_PREFIX = "slrk_";
const DISPLAY_PREFIX_LENGTH = 13;

export interface PersonalRunKeyIdentity {
  keyId: string;
  userId: string;
  name: string;
  permissions: readonly RunKeyPermission[];
  lastUsedAt?: string | null;
}

const LAST_USED_WRITE_INTERVAL_MS = 15 * 60 * 1000;

export const MAX_ACTIVE_PERSONAL_RUN_KEYS = 10;

export interface PersonalRunKeyRecord {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  created_at: string;
  permissions: readonly RunKeyPermission[];
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createPersonalRunKeySecret(): Promise<{
  key: string;
  keyHash: string;
  keyPrefix: string;
}> {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const key = `${PERSONAL_RUN_KEY_PREFIX}${encodeBase64Url(randomBytes)}`;
  const keyHash = await sha256Hex(key);
  if (!keyHash) {
    throw new Error("Unable to hash personal run key");
  }

  return {
    key,
    keyHash,
    keyPrefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

export async function insertPersonalRunKeyWithinCap(
  env: Env,
  record: PersonalRunKeyRecord,
): Promise<boolean> {
  const result: unknown = await createDb(env).run(sql`
    insert into personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at, permissions)
    select ${record.id}, ${record.user_id}, ${record.name}, ${record.key_prefix}, ${record.key_hash}, ${record.created_at}, ${JSON.stringify(record.permissions)}
    where (
      select count(*) from personal_run_keys
      where user_id = ${record.user_id} and revoked_at is null
    ) < ${MAX_ACTIVE_PERSONAL_RUN_KEYS}
  `);
  const meta = typeof result === "object" && result !== null ? (result as { meta?: { changes?: unknown } }).meta : undefined;
  return meta?.changes === 1;
}

export async function authenticatePersonalRunKey(
  request: Request,
  env: Env,
): Promise<PersonalRunKeyIdentity | null> {
  const token = readBearerToken(request);
  if (!token?.startsWith(PERSONAL_RUN_KEY_PREFIX)) return null;

  const keyHash = await sha256Hex(token);
  if (!keyHash) return null;

  const db = createDb(env);
  const { personalRunKeys } = schema;
  const [record] = await db
    .select({
      id: personalRunKeys.id,
      userId: personalRunKeys.user_id,
      name: personalRunKeys.name,
      permissions: personalRunKeys.permissions,
      lastUsedAt: personalRunKeys.last_used_at,
    })
    .from(personalRunKeys)
    .where(and(eq(personalRunKeys.key_hash, keyHash), isNull(personalRunKeys.revoked_at)))
    .limit(1);

  if (!record?.id || !record.userId) return null;

  return {
    keyId: record.id,
    userId: record.userId,
    name: record.name,
    permissions: parseStoredRunKeyPermissions(record.permissions),
    lastUsedAt: record.lastUsedAt,
  };
}

export async function markPersonalRunKeyUsed(
  env: Env,
  identity: PersonalRunKeyIdentity,
): Promise<void> {
  const now = new Date();
  const previousUse = identity.lastUsedAt ? Date.parse(identity.lastUsedAt) : Number.NaN;
  if (Number.isFinite(previousUse) && now.getTime() - previousUse < LAST_USED_WRITE_INTERVAL_MS) return;

  const cutoff = new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS).toISOString();
  const { personalRunKeys } = schema;
  await createDb(env)
    .update(personalRunKeys)
    .set({ last_used_at: now.toISOString() })
    .where(and(
      eq(personalRunKeys.id, identity.keyId),
      eq(personalRunKeys.user_id, identity.userId),
      isNull(personalRunKeys.revoked_at),
      or(isNull(personalRunKeys.last_used_at), lt(personalRunKeys.last_used_at, cutoff)),
    ));
}
