import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../../support/elements';
import { emptyTheAuthTables, inMemoryAuth } from '../../../support/betterAuthInMemory';

import { LOCAL_AUTH_ORIGIN as BASE_URL, postToBetterAuth, sessionCookieFrom } from '../../../support/betterAuth';

const R2_BASE_URL = 'https://files.serplists.test';
const EMAIL = 'john@test.com';
const env = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
  AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
  FRONTEND_URL: 'http://localhost:8080',
  R2_PUBLIC_BASE_URL: R2_BASE_URL,
} as any;

const authRequest = (path: string, init: { body?: unknown; cookie?: string } = {}) => postToBetterAuth(env, path, init);

function signUp(body: Record<string, unknown>) {
  return authRequest('sign-up/email', { body: { email: EMAIL, password: 'original-password-1', ...body } });
}

async function signedUpCookie() {
  const response = await signUp({ name: 'John' });
  expect(response.status).toBe(200);
  return sessionCookieFrom(response);
}

function storedUser() {
  return firstOf(inMemoryAuth.tables.users);
}

const uploadUrl = (base: string) => `${base}/api/uploads/file?key=${encodeURIComponent('avatars/u1/a.png')}`;

describe('account name and avatar validation', { timeout: 30_000 }, () => {
  beforeEach(() => {
    emptyTheAuthTables();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['a 101-character name', 'x'.repeat(101)],
    ['a ~900 KB name', 'x'.repeat(900_000)],
    ['a whitespace-only name', '   '],
    ['a number', 42],
    ['an object', { first: 'John' }],
    ['a name with control characters', 'John\u0000Smith'],
  ])('rejects sign-up with %s and creates no account', async (_label, name) => {
    const response = await signUp({ name });

    expect(response.status).toBe(400);
    expect(inMemoryAuth.tables.users).toEqual([]);
    expect(inMemoryAuth.tables.account).toEqual([]);
  });

  it('rejects sign-up without a name', async () => {
    const response = await signUp({});

    expect(response.status).toBe(400);
    expect(inMemoryAuth.tables.users).toEqual([]);
  });

  it('rejects sign-up with an avatar image outside SERP Lists uploads', async () => {
    const response = await signUp({ name: 'John', image: 'https://tracker.example/pixel.gif' });

    expect(response.status).toBe(400);
    expect(inMemoryAuth.tables.users).toEqual([]);
  });

  it('stores a trimmed name on sign-up', async () => {
    const response = await signUp({ name: '  John Smith  ' });

    expect(response.status).toBe(200);
    expect(storedUser().name).toBe('John Smith');
  });

  it.each([
    ['a 101-character name', { name: 'y'.repeat(101) }],
    ['a ~900 KB name', { name: 'y'.repeat(900_000) }],
    ['an empty name', { name: '' }],
    ['a non-string name', { name: ['John'] }],
    ['a data: image', { image: 'data:image/png;base64,iVBORw0KGgo=' }],
    ['a javascript: image', { image: 'javascript:alert(1)' }],
    ['a blob: image', { image: `blob:${BASE_URL}/5a1b` }],
    ['an image on another host', { image: 'https://tracker.example/api/uploads/file?key=avatars%2Fu1%2Fa.png' }],
    ['an image outside the uploads path', { image: `${BASE_URL}/pixel.gif` }],
    ['an image URL over 2048 characters', { image: `${uploadUrl(BASE_URL)}${'z'.repeat(2048)}` }],
    ['a non-string image', { image: 42 }],
    ['a display username over 30 characters', { displayUsername: 'd'.repeat(31) }],
  ])('rejects update-user with %s and leaves the account unchanged', async (_label, body) => {
    const cookie = await signedUpCookie();
    const before = { ...storedUser() };

    const response = await authRequest('update-user', { cookie, body });

    expect(response.status).toBe(400);
    expect(storedUser().name).toBe(before.name);
    expect(storedUser().avatar_url ?? null).toBe(before.avatar_url ?? null);
    expect(storedUser().displayUsername ?? null).toBe(before.displayUsername ?? null);
  });

  it.each([
    ['the API origin', uploadUrl(BASE_URL)],
    ['the configured frontend origin', uploadUrl('http://localhost:8080')],
    ['the public R2 base URL', uploadUrl(R2_BASE_URL)],
  ])('accepts an avatar uploaded through SERP Lists on %s', async (_label, image) => {
    const cookie = await signedUpCookie();

    const response = await authRequest('update-user', { cookie, body: { image } });

    expect(response.status).toBe(200);
    expect(storedUser().avatar_url).toBe(image);
  });

  it.each([null, ''])('clears the avatar when the image is %j', async (image) => {
    const cookie = await signedUpCookie();
    expect((await authRequest('update-user', { cookie, body: { image: uploadUrl(BASE_URL) } })).status).toBe(200);

    const response = await authRequest('update-user', { cookie, body: { image } });

    expect(response.status).toBe(200);
    expect(storedUser().avatar_url).toBeNull();
  });

  it('trims an updated name and leaves fields that were not sent alone', async () => {
    const cookie = await signedUpCookie();
    expect((await authRequest('update-user', { cookie, body: { image: uploadUrl(BASE_URL) } })).status).toBe(200);

    const response = await authRequest('update-user', { cookie, body: { name: '  Johnny  ' } });

    expect(response.status).toBe(200);
    expect(storedUser().name).toBe('Johnny');
    expect(storedUser().avatar_url).toBe(uploadUrl(BASE_URL));
  });

  it('still allows a username-only update', async () => {
    const cookie = await signedUpCookie();

    const response = await authRequest('update-user', { cookie, body: { username: 'JohnSmith' } });

    expect(response.status).toBe(200);
    expect(storedUser()).toMatchObject({ name: 'John', username: 'johnsmith' });
  });
});
