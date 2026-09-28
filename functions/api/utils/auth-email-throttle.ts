import { eq, sql } from 'drizzle-orm';
import type { Env } from '../types';
import { createDb, schema } from '../db';
import { log } from './logger';

export type AuthEmailKind = 'password-reset' | 'email-verification';

/** Per account and kind of email: at most one a minute and five an hour. */
export const AUTH_EMAIL_MIN_INTERVAL_MS = 60 * 1000;
export const AUTH_EMAIL_WINDOW_MS = 60 * 60 * 1000;
export const AUTH_EMAIL_MAX_PER_WINDOW = 5;

/**
 * Claims one password-reset or verification email for an account. Returns false
 * when the account was sent that kind of email in the last minute, or five in
 * the current hour, so request loops cannot flood an inbox or spend the email
 * provider's quota.
 *
 * State lives in the Better Auth `verification` table under a fixed id that no
 * Better Auth lookup uses: `value` counts sends in the window, `expires_at` ends
 * the window and `updated_at` is the last send. The claim is one upsert on the
 * primary key, so concurrent requests cannot both claim the last slot, and the
 * row is removed by Better Auth's expired-row cleanup once its window ends.
 */
export async function claimAuthEmailSend(
  db: ReturnType<typeof createDb>,
  params: { kind: AuthEmailKind; userId: string; now?: number },
): Promise<boolean> {
  const { verification } = schema;
  const now = params.now ?? Date.now();
  const id = `auth-email-throttle:${params.kind}:${params.userId}`;
  const windowOver = sql`${verification.expiresAt} <= ${now}`;
  const sendsInWindow = sql`CAST(${verification.value} AS INTEGER)`;

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
      setWhere: sql`${verification.updatedAt} <= ${now - AUTH_EMAIL_MIN_INTERVAL_MS}
        AND (${windowOver} OR ${sendsInWindow} < ${AUTH_EMAIL_MAX_PER_WINDOW})`,
    })
    .returning({ id: verification.id });

  return claimed.length > 0;
}

/**
 * Decides whether an auth email may be sent. Fails open: if D1 cannot record
 * the send, the email still goes out, so a database problem never blocks
 * sign-up or password recovery.
 */
export async function shouldSendAuthEmail(env: Env, kind: AuthEmailKind, userId: string): Promise<boolean> {
  try {
    const allowed = await claimAuthEmailSend(createDb(env), { kind, userId });
    if (!allowed) log('info', 'auth_email_throttled', { kind, userId });
    return allowed;
  } catch (error) {
    log('error', 'auth_email_throttle_failed', {
      kind,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/**
 * Better Auth stores a reset token before it calls sendResetPassword. When that
 * email is skipped nobody can use the token, so delete it rather than leave a
 * row behind for every throttled request.
 */
export async function discardUnsentPasswordResetToken(env: Env, token: string): Promise<void> {
  const { verification } = schema;
  try {
    await createDb(env).delete(verification).where(eq(verification.identifier, `reset-password:${token}`));
  } catch (error) {
    log('warn', 'auth_email_reset_token_cleanup_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
