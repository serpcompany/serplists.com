import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { username } from 'better-auth/plugins';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../../support/elements';
import { betterAuthLogger } from '@functions/api/utils/better-auth-logger';
import { logLineIn } from '../../../support/storedJson';

const BASE_URL = 'http://localhost:8788';
const VICTIM = 'victim@example.com';
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

type Captured = { method: (typeof CONSOLE_METHODS)[number]; line: string };

function captureConsole(): Captured[] {
  const captured: Captured[] = [];
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation((...parts: unknown[]) => {
      captured.push({
        method,
        line: parts.map((part) => (part instanceof Error ? `${part.name}: ${part.message}` : typeof part === 'string' ? part : JSON.stringify(part))).join(' '),
      });
    });
  }
  return captured;
}

function expectStructuredAndClean(captured: Captured[], secrets: string[]) {
  for (const { line } of captured) {
    for (const secret of secrets) expect(line).not.toContain(secret);
    expect((): unknown => JSON.parse(line), line).not.toThrow();
    expect(JSON.parse(line)).toMatchObject({ message: 'better_auth' });
  }
}

describe('betterAuthLogger', () => {
  let captured: Captured[];

  beforeEach(() => {
    captured = captureConsole();
  });

  afterEach(() => vi.restoreAllMocks());

  it('writes Better Auth messages as JSON log lines without email addresses', () => {
    betterAuthLogger.log('error', 'User not found', { email: VICTIM });
    betterAuthLogger.log('info', `Sign-up attempt for existing email: ${VICTIM}`);
    betterAuthLogger.log('error', 'User not found', { username: VICTIM });
    betterAuthLogger.log('error', 'Reset Password: User not found', { email: VICTIM.toUpperCase() });
    betterAuthLogger.log('warn', `Could not deliver to "Victim" <${VICTIM}>`);

    expect(captured).toHaveLength(5);
    expectStructuredAndClean(captured, [VICTIM, VICTIM.toUpperCase(), '@example.com', '@EXAMPLE.COM']);
  });

  it('keeps the error name and a scrubbed message so real failures stay diagnosable', () => {
    const queryError = new Error(
      `Failed query: select "id" from "session" where "token" = ?\nparams: sess_SECRET_TOKEN,${VICTIM}`,
    );
    queryError.name = 'DrizzleQueryError';
    (queryError as Error & { cause?: unknown }).cause = new Error(`D1_ERROR: Network connection lost for ${VICTIM}`);

    betterAuthLogger.log('error', 'INTERNAL_SERVER_ERROR', queryError);

    expectStructuredAndClean(captured, [VICTIM, 'sess_SECRET_TOKEN']);
    const entry = logLineIn(firstOf(captured).line);
    expect(firstOf(captured).method).toBe('error');
    expect(entry).toMatchObject({ level: 'error', detail: 'INTERNAL_SERVER_ERROR', errorName: 'DrizzleQueryError' });
    expect(entry['errorMessage']).toContain('Failed query: select "id" from "session"');
    expect(entry['errorCause']).toContain('Network connection lost');
  });

  it('handles an Error passed as the message', () => {
    betterAuthLogger.log('error', new TypeError(`bad input from ${VICTIM}`));

    expectStructuredAndClean(captured, [VICTIM]);
    expect(JSON.parse(firstOf(captured).line)).toMatchObject({ errorName: 'TypeError' });
  });

  it('logs routine sign-in, reset and sign-up mistakes as info, not errors', () => {
    betterAuthLogger.log('error', 'User not found', { email: VICTIM });
    betterAuthLogger.log('error', 'Invalid password');
    betterAuthLogger.log('error', 'Reset Password: User not found', { email: VICTIM });
    betterAuthLogger.log('error', 'Failed to create user', new Error('D1_ERROR'));

    expect(captured.map(({ method }) => method)).toEqual(['info', 'info', 'info', 'error']);
  });

  it('never throws into an auth request', () => {
    vi.mocked(console.error).mockImplementation(() => {
      throw new Error('console unavailable');
    });
    const hostile = {
      get message(): string {
        throw new Error('getter failed');
      },
    };

    expect(() => betterAuthLogger.log('error', 'x', Object.assign(new Error('y'), { cause: hostile }))).not.toThrow();
  });
});

describe('a real Better Auth instance with betterAuthLogger, which fails when an upgrade logs emails a new way', { timeout: 30_000 }, () => {
  afterEach(() => vi.restoreAllMocks());

  function createMemoryAuth() {
    const db: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] };
    return betterAuth({
      baseURL: BASE_URL,
      basePath: '/api/auth',
      secret: 'test-better-auth-secret-32-chars-minimum!!',
      database: memoryAdapter(db),
      logger: betterAuthLogger,
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        sendResetPassword: async () => undefined,
      },
      plugins: [username()],
    });
  }

  function post(path: string, body: unknown) {
    return new Request(`${BASE_URL}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify(body),
    });
  }

  it('keeps email addresses out of the logs for unknown sign-ins, resets and repeat sign-ups', async () => {
    const auth = createMemoryAuth();
    const captured = captureConsole();
    const password = 'password123456';

    expect((await auth.handler(post('sign-in/email', { email: VICTIM, password }))).status).toBe(401);
    expect((await auth.handler(post('sign-in/username', { username: VICTIM, password }))).status).toBeGreaterThanOrEqual(400);
    expect(
      (await auth.handler(post('request-password-reset', { email: VICTIM, redirectTo: `${BASE_URL}/reset` }))).status,
    ).toBe(200);
    const member = 'member@example.com';
    expect((await auth.handler(post('sign-up/email', { email: member, password, name: 'Member' }))).status).toBe(200);
    expect((await auth.handler(post('sign-up/email', { email: member, password, name: 'Member' }))).status).toBe(422);

    expect(captured.length).toBeGreaterThan(0);
    expectStructuredAndClean(captured, [VICTIM, member, '@example.com']);
  });
});
