import { eq, sql } from 'drizzle-orm';
import type { Env } from '../types';
import { createDb, schema } from '../db';
import { describeErrorForLog, log } from './logger';

export type AuthEmailKind = 'password-reset' | 'email-verification';

const AUTH_EMAIL_MIN_INTERVAL_MS = 60 * 1000;
const AUTH_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const AUTH_EMAIL_MAX_PER_WINDOW = 5;

function throttleId(kind: AuthEmailKind, userId: string): string {
  return `auth-email-throttle:${kind}:${userId}`;
}

export async function claimAuthEmailSend(
  db: ReturnType<typeof createDb>,
  params: { kind: AuthEmailKind; userId: string; now?: number },
): Promise<boolean> {
  const { verification } = schema;
  const now = params.now ?? Date.now();
  const id = throttleId(params.kind, params.userId);
  const windowOver = sql`${verification.expiresAt} <= ${now}`;
  const sendsInWindow = sql`CAST(${verification.value} AS INTEGER)`;
  const minIntervalPassed = sql`${verification.updatedAt} <= ${now - AUTH_EMAIL_MIN_INTERVAL_MS}`;

  const claimed = await db
    .insert(verification)
    .values({
      id,
      identifier: id,
      value: '1',
      expiresAt: new Date(now + AUTH_EMAIL_WINDOW_MS),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: verification.id,
      set: {
        value: sql`CASE WHEN ${windowOver} THEN '1' ELSE CAST(${sendsInWindow} + 1 AS TEXT) END`,
        expiresAt: sql`CASE WHEN ${windowOver} THEN ${now + AUTH_EMAIL_WINDOW_MS} ELSE ${verification.expiresAt} END`,
        updatedAt: sql`${now}`,
      },
      setWhere: sql`${minIntervalPassed} AND (${windowOver} OR ${sendsInWindow} < ${AUTH_EMAIL_MAX_PER_WINDOW})`,
    })
    .returning({ id: verification.id });

  return claimed.length > 0;
}

export async function shouldSendAuthEmail(env: Env, kind: AuthEmailKind, userId: string): Promise<boolean> {
  try {
    const allowed = await claimAuthEmailSend(createDb(env), { kind, userId });
    if (!allowed) log('info', 'auth_email_throttled', { kind, userId });
    return allowed;
  } catch (error) {
    log('error', 'auth_email_throttle_failed', {
      kind,
      userId,
      ...describeErrorForLog(error),
    });
    return true;
  }
}

export async function releaseAuthEmailSend(env: Env, kind: AuthEmailKind, userId: string): Promise<void> {
  const { verification } = schema;
  try {
    await createDb(env)
      .update(verification)
      .set({
        value: sql`CAST(MAX(CAST(${verification.value} AS INTEGER) - 1, 0) AS TEXT)`,
        updatedAt: new Date(0),
      })
      .where(eq(verification.id, throttleId(kind, userId)));
  } catch (error) {
    log('warn', 'auth_email_throttle_release_failed', {
      kind,
      userId,
      ...describeErrorForLog(error),
    });
  }
}

export async function deliverAuthEmail(
  env: Env,
  kind: AuthEmailKind,
  userId: string,
  send: () => Promise<void>,
): Promise<boolean> {
  if (!(await shouldSendAuthEmail(env, kind, userId))) return false;
  try {
    await send();
    return true;
  } catch (error) {
    await releaseAuthEmailSend(env, kind, userId);
    throw error;
  }
}

export async function discardUnsentPasswordResetToken(env: Env, token: string): Promise<void> {
  const { verification } = schema;
  try {
    await createDb(env).delete(verification).where(eq(verification.identifier, `reset-password:${token}`));
  } catch (error) {
    log('warn', 'auth_email_reset_token_cleanup_failed', {
      ...describeErrorForLog(error),
    });
  }
}
