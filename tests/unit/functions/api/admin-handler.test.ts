import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAdmin } from '@functions/api/handlers/admin';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { createMigratedD1 } from '../../../fixtures/sqliteD1';

const ADMIN_SECRET = 'admin-secret-for-tests';
const DAY = 24 * 60 * 60;

// Runs against a migrated SQLite database so the real table, primary key and
// upsert are used.
describe('POST /api/admin/entitlements/override', () => {
  let database: ReturnType<typeof createMigratedD1>;
  let env: any;
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  function addUser(id: string, email: string) {
    database.sqlite
      .prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)')
      .run(id, email, `Name ${id}`);
  }

  function overrideRows() {
    return database.sqlite.prepare('SELECT user_id, plan, expires_at, note FROM entitlement_overrides').all();
  }

  function post(body: unknown, secret: string | null = ADMIN_SECRET) {
    return handleAdmin(
      new Request('http://localhost/api/admin/entitlements/override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'X-Admin-Secret': secret } : {}),
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      env,
    );
  }

  beforeEach(() => {
    database = createMigratedD1();
    env = { DB: database.d1, ENTITLEMENTS_ADMIN_SECRET: ADMIN_SECRET };
    addUser('user-1', 'jane@example.com');
    addUser('user-2', 'other@example.com');
  });

  afterEach(() => {
    vi.useRealTimers();
    database.sqlite.close();
  });

  it.each([
    ['no secret', null],
    ['a wrong secret', 'not-the-secret'],
  ])('returns 401 with %s', async (_label, secret) => {
    const response = await post({ userId: 'user-1', plan: 'pro' }, secret);

    expect(response.status).toBe(401);
    expect(overrideRows()).toEqual([]);
  });

  it.each([
    ['an ISO date string', '2026-10-31'],
    ['a numeric string', String(nowSeconds() + 30 * DAY)],
    ['a millisecond timestamp', Date.now() + 30 * DAY * 1000],
    ['a float', nowSeconds() + 30 * DAY + 0.5],
    ['a past time', nowSeconds() - DAY],
    ['zero', 0],
    ['more than five years away', nowSeconds() + 6 * 365 * DAY],
    ['a boolean', true],
  ])('rejects expiresAt given as %s without writing', async (_label, expiresAt) => {
    const response = await post({ userId: 'user-1', plan: 'pro', expiresAt });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/expiresAt/);
    expect(overrideRows()).toEqual([]);
  });

  it.each([
    ['a number', 1],
    ['an array', ['free']],
    ['an unknown plan', 'team'],
  ])('rejects plan given as %s without writing', async (_label, plan) => {
    const response = await post({ userId: 'user-1', plan });

    expect(response.status).toBe(400);
    expect(overrideRows()).toEqual([]);
  });

  it('rejects a body with neither userId nor email', async () => {
    const response = await post({ plan: 'pro' });

    expect(response.status).toBe(400);
    expect(overrideRows()).toEqual([]);
  });

  it('returns 404 for an unknown userId and writes nothing', async () => {
    const response = await post({ userId: 'typo', plan: 'pro' });

    expect(response.status).toBe(404);
    expect(overrideRows()).toEqual([]);
  });

  it('returns 404 for an unknown email and writes nothing', async () => {
    const response = await post({ email: 'nobody@example.com', plan: 'pro' });

    expect(response.status).toBe(404);
    expect(overrideRows()).toEqual([]);
  });

  it('returns 400 when userId and email name different users', async () => {
    const response = await post({ userId: 'user-1', email: 'other@example.com', plan: 'pro' });

    expect(response.status).toBe(400);
    expect(overrideRows()).toEqual([]);
  });

  it('finds the user from a mixed-case email', async () => {
    const response = await post({ email: '  Jane@Example.COM ', plan: 'pro' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, userId: 'user-1', plan: 'pro' });
    expect(overrideRows()).toEqual([{ user_id: 'user-1', plan: 'pro', expires_at: null, note: null }]);
  });

  it('stores a valid Unix-seconds expiry exactly and reports it', async () => {
    const expiresAt = nowSeconds() + 30 * DAY;

    const response = await post({ userId: 'user-1', plan: 'pro', expiresAt, note: 'October comp' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      userId: 'user-1',
      plan: 'pro',
      expiresAt,
      expiresAtIso: new Date(expiresAt * 1000).toISOString(),
    });
    expect(overrideRows()).toEqual([{ user_id: 'user-1', plan: 'pro', expires_at: expiresAt, note: 'October comp' }]);
  });

  it.each([
    ['omitted', {}],
    ['null', { expiresAt: null }],
  ])('stores no expiry when expiresAt is %s', async (_label, extra) => {
    const response = await post({ userId: 'user-1', plan: 'free', ...extra });

    expect(response.status).toBe(200);
    expect(overrideRows()).toEqual([{ user_id: 'user-1', plan: 'free', expires_at: null, note: null }]);
  });

  it('updates the existing row on a second POST for the same user', async () => {
    await post({ userId: 'user-1', plan: 'pro', note: 'first' });
    const expiresAt = nowSeconds() + DAY;

    const response = await post({ email: 'jane@example.com', plan: 'free', expiresAt, note: 'second' });

    expect(response.status).toBe(200);
    expect(overrideRows()).toEqual([{ user_id: 'user-1', plan: 'free', expires_at: expiresAt, note: 'second' }]);
  });

  it('writes an expiry that getEntitlementsForUser stops honoring once it passes', async () => {
    const expiresAt = nowSeconds() + 30 * DAY;
    await post({ userId: 'user-1', plan: 'pro', expiresAt });

    expect((await getEntitlementsForUser(env, 'user-1')).plan).toBe('pro');

    vi.useFakeTimers();
    vi.setSystemTime((expiresAt + 1) * 1000);
    expect((await getEntitlementsForUser(env, 'user-1')).plan).toBe('free');
  });
});
