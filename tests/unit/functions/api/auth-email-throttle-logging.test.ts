import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discardUnsentPasswordResetToken,
  releaseAuthEmailSend,
  shouldSendAuthEmail,
} from '@functions/api/utils/auth-email-throttle';
import { createSqliteD1, type SqliteD1 } from './support/sqlite-d1';

// Drizzle puts a failed query's bound values in its error message
// ("Failed query: ...\nparams: ..."). These warnings must log the D1 error only.
const D1_OUTAGE = 'D1_ERROR: Network connection lost';
const RESET_TOKEN = 'resettoken123secret';

describe('auth email throttle failure logs', () => {
  let d1: SqliteD1;
  let lines: string[];

  beforeEach(() => {
    d1 = createSqliteD1();
    d1.setStatementHook(() => {
      throw new Error(D1_OUTAGE);
    });
    lines = [];
    for (const level of ['info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    d1.close();
  });

  const env = () => ({ DB: d1.binding }) as never;

  function loggedEvent(message: string) {
    const entry = lines.map((line) => JSON.parse(line)).find((logged) => logged.message === message);
    expect(entry).toBeDefined();
    return entry;
  }

  it('keeps a reset token whose cleanup failed out of the log', async () => {
    await discardUnsentPasswordResetToken(env(), RESET_TOKEN);

    expect(lines.join('\n')).not.toContain(RESET_TOKEN);
    expect(lines.join('\n')).not.toContain('params:');
    expect(loggedEvent('auth_email_reset_token_cleanup_failed')).toMatchObject({
      errorName: 'DrizzleQueryError',
      errorMessage: D1_OUTAGE,
    });
  });

  it('logs the D1 error, not the query parameters, when a claim or release fails', async () => {
    await expect(shouldSendAuthEmail(env(), 'password-reset', 'user-1')).resolves.toBe(true);
    await releaseAuthEmailSend(env(), 'password-reset', 'user-1');

    expect(lines.join('\n')).not.toContain('params:');
    for (const event of ['auth_email_throttle_failed', 'auth_email_throttle_release_failed']) {
      expect(loggedEvent(event)).toMatchObject({
        userId: 'user-1',
        errorName: 'DrizzleQueryError',
        errorMessage: D1_OUTAGE,
      });
    }
  });
});
