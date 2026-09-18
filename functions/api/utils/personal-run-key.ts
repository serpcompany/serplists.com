import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import { sha256Hex } from "./crypto";

const PERSONAL_RUN_KEY_PREFIX = "slrk_";
const DISPLAY_PREFIX_LENGTH = 13;

export interface PersonalRunKeyIdentity {
  keyId: string;
  userId: string;
  name: string;
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

export async function authenticatePersonalRunKey(
  request: Request,
  env: Env,
): Promise<PersonalRunKeyIdentity | null> {
  const token = readBearerToken(request);
  if (!token?.startsWith(PERSONAL_RUN_KEY_PREFIX)) return null;

  const keyHash = await sha256Hex(token);
  if (!keyHash) return null;

  const db = createDb(env);
  const { personal_run_keys } = schema;
  const [record] = await db
    .update(personal_run_keys)
    .set({ last_used_at: new Date().toISOString() })
    .where(and(eq(personal_run_keys.key_hash, keyHash), isNull(personal_run_keys.revoked_at)))
    .returning({
      id: personal_run_keys.id,
      userId: personal_run_keys.user_id,
      name: personal_run_keys.name,
    });

  if (!record?.id || !record.userId) return null;

  return { keyId: record.id, userId: record.userId, name: record.name };
}
