import { memoryAdapter } from 'better-auth/adapters/memory';
import type { BetterAuthOptions } from 'better-auth';
import { DrizzleQueryError } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Runs the app's real Better Auth configuration (createBetterAuth) against an
// in-memory database that enforces D1's UNIQUE idx_users_username the way D1
// does through Drizzle: the write throws a DrizzleQueryError whose cause is
// the SQLite constraint error.
type Row = Record<string, any>;
const memory = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  // Simulates another request claiming a username between the app's check and its write.
  claimBeforeWrite: null as null | { id: string; username: string },
}));

function uniqueUsernameError(): Error {
  return new DrizzleQueryError(
    'update "users" set "username" = ? where "users"."id" = ?',
    [],
    new Error('D1_ERROR: UNIQUE constraint failed: users.username: SQLITE_CONSTRAINT'),
  );
}

function assertUsernameFree(username: unknown, selfId?: string) {
  if (typeof username !== 'string') return;
  if (memory.claimBeforeWrite) {
    memory.db.users.push({ ...memory.claimBeforeWrite, email: `${memory.claimBeforeWrite.id}@example.com` });
    memory.claimBeforeWrite = null;
  }
  if (memory.db.users.some((row) => row.username === username && row.id !== selfId)) {
    throw uniqueUsernameError();
  }
}

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: () => (options: BetterAuthOptions) => {
    const adapter = memoryAdapter(memory.db)(options);
    return {
      ...adapter,
      create: async (args: Parameters<typeof adapter.create>[0]) => {
        if (args.model === 'user') assertUsernameFree((args.data as Row).username);
        return adapter.create(args);
      },
      update: async (args: Parameters<typeof adapter.update>[0]) => {
        if (args.model === 'user') {
          const selfId = args.where.find((clause) => clause.field === 'id')?.value;
          assertUsernameFree((args.update as Row).username, String(selfId));
        }
        return adapter.update(args);
      },
    };
  },
}));

vi.mock('@functions/api/db', () => ({
  createDb: vi.fn(() => ({})),
  schema: {},
}));

import { createBetterAuth } from '@functions/api/better-auth';
import { isUsernameUniqueViolation } from '@functions/api/utils/username-conflict';

const BASE_URL = 'http://localhost:8788';
const env = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
  AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
} as any;

function authRequest(path: string, init: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { Origin: BASE_URL, 'Content-Type': 'application/json' };
  if (init.cookie) headers.Cookie = init.cookie;
  const request = new Request(`${BASE_URL}/api/auth/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(init.body ?? {}),
  });
  return createBetterAuth(env, request).handler(request);
}

async function signUp(email: string, extra: Record<string, unknown> = {}) {
  const response = await authRequest('sign-up/email', {
    body: { email, password: 'original-password-1', name: 'Person', ...extra },
  });
  expect(response.status).toBe(200);
  const match = (response.headers.get('set-cookie') ?? '').match(/better-auth\.session_token=[^;]+/);
  if (!match) throw new Error('No session cookie');
  return match[0];
}

function userRow(email: string) {
  return memory.db.users.find((row) => row.email === email);
}

async function expectUsernameTaken(response: Response) {
  expect(response.status).toBe(422);
  const body = await response.json();
  expect(body.code).toBe('USERNAME_IS_ALREADY_TAKEN');
  expect(body.message).toMatch(/already taken/i);
}

describe('changing username to one another account uses', { timeout: 30_000 }, () => {
  let aliceCookie: string;
  let bobCookie: string;

  beforeEach(async () => {
    memory.db = { users: [], session: [], account: [], verification: [] };
    memory.claimBeforeWrite = null;
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    aliceCookie = await signUp('alice@example.com', { username: 'alex' });
    bobCookie = await signUp('bob@example.com', { username: 'bob' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['alex', 'ALEX', 'Alex'])('answers 422 "already taken" for %s and leaves the account unchanged', async (name) => {
    const response = await authRequest('update-user', { cookie: bobCookie, body: { username: name } });

    await expectUsernameTaken(response);
    expect(userRow('bob@example.com')).toMatchObject({ username: 'bob' });
    expect(userRow('alice@example.com')).toMatchObject({ username: 'alex' });
  });

  it('rejects the whole save, so the name sent with a taken username is not stored', async () => {
    const response = await authRequest('update-user', {
      cookie: bobCookie,
      body: { username: 'alex', name: 'New Name' },
    });

    await expectUsernameTaken(response);
    expect(userRow('bob@example.com')).toMatchObject({ username: 'bob', name: 'Person' });
  });

  it('answers 422, not a bodyless 500, when another account claims the username during the save', async () => {
    memory.claimBeforeWrite = { id: 'racer', username: 'carol' };

    const response = await authRequest('update-user', { cookie: bobCookie, body: { username: 'carol' } });

    await expectUsernameTaken(response);
    expect(userRow('bob@example.com')).toMatchObject({ username: 'bob' });
  });

  it('answers 422 when two sign-ups race for the same username', async () => {
    memory.claimBeforeWrite = { id: 'racer', username: 'dana' };

    const response = await authRequest('sign-up/email', {
      body: { email: 'dana@example.com', password: 'original-password-1', name: 'Dana', username: 'dana' },
    });

    await expectUsernameTaken(response);
    expect(userRow('dana@example.com')).toBeUndefined();
  });

  it('lets an account re-save its own username with different case', async () => {
    const response = await authRequest('update-user', { cookie: aliceCookie, body: { username: 'Alex' } });

    expect(response.status).toBe(200);
    expect(userRow('alice@example.com')).toMatchObject({ username: 'alex' });
  });

  it('saves a free username and a name-only change', async () => {
    const rename = await authRequest('update-user', { cookie: bobCookie, body: { username: 'Robert' } });
    expect(rename.status).toBe(200);

    const nameOnly = await authRequest('update-user', { cookie: bobCookie, body: { name: 'Bob Smith' } });
    expect(nameOnly.status).toBe(200);

    expect(userRow('bob@example.com')).toMatchObject({ username: 'robert', name: 'Bob Smith' });
  });
});

describe('isUsernameUniqueViolation', () => {
  it('finds the users.username constraint on the error Drizzle wraps', () => {
    expect(isUsernameUniqueViolation(uniqueUsernameError())).toBe(true);
  });

  it.each([
    ['another unique index', new Error('D1_ERROR: UNIQUE constraint failed: users.email: SQLITE_CONSTRAINT')],
    ['an unrelated error', new Error('D1_ERROR: no such table: users')],
    ['a non-error value', 'UNIQUE constraint failed: users.username'],
  ])('ignores %s', (_label, error) => {
    expect(isUsernameUniqueViolation(error)).toBe(false);
  });
});
