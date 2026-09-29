import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMetadata } from '@/app/(site)/profile/[username]/page';
import { APP_BRAND_NAME } from '@/lib/brand';
import { loadProfilePageSeo } from '@/server/pageMeta/profilePage';
import { API_SECRET, failingD1, serverContext } from '../../../support/nextServerContext';
import { SqliteD1 } from '../../../support/sqlite-d1';

vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', async () => (await import('../../../support/nextServerContext')).cloudflareMock);
vi.mock('next/headers', async () => (await import('../../../support/nextServerContext')).headersMock);

// /profile/<username> names the profile in its <head>: the name and summary the page shows,
// found the way the page finds them (the same two API requests, sent to the API router in
// this Worker). A profile that does not exist is kept out of search; a failed lookup keeps
// the site's defaults.

let d1: SqliteD1;

const addUser = (id: string, username: string, name: string | null) =>
  d1.run(
    `INSERT INTO users (id, email, name, username, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`,
    id,
    `${id}@example.test`,
    name,
    username,
  );

const addPublicTemplate = (id: string, userId: string, category: string) =>
  d1.run(
    `INSERT INTO templates (id, user_id, title, items, slug, is_public, created_at, owner_type, category)
     VALUES (?, ?, ?, '[]', ?, 1, '2026-02-01', 'user', ?)`,
    id,
    userId,
    `Template ${id}`,
    id,
    JSON.stringify([category]),
  );

const params = (username: string) => ({ params: Promise.resolve({ username }) });

beforeEach(() => {
  d1 = new SqliteD1();
  serverContext.env = { DB: d1.binding, BETTER_AUTH_SECRET: API_SECRET };
  serverContext.host = 'serplists.com';
  // The router logs every request it serves.
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('profile page metadata', () => {
  it('names the profile and summarizes its public templates', async () => {
    addUser('user-1', 'johndoe', 'John Doe');
    addPublicTemplate('seo-audit', 'user-1', 'Technical SEO');

    const metadata = await generateMetadata(params('johndoe'));

    expect(metadata.title).toEqual({ absolute: `John Doe | ${APP_BRAND_NAME}` });
    expect(metadata.description).toBe('Public checklist templates from @johndoe covering Technical SEO.');
    expect(metadata.alternates?.canonical).toBe('https://serplists.com/profile/johndoe');
    expect(metadata.robots).toBe('index, follow');
  });

  it('names a profile without a name by its username', async () => {
    addUser('user-1', 'johndoe', null);

    const metadata = await generateMetadata(params('johndoe'));

    expect(metadata.title).toEqual({ absolute: `@johndoe | ${APP_BRAND_NAME}` });
  });

  it('points the canonical at the stored username for another letter case', async () => {
    addUser('user-1', 'johndoe', 'John Doe');

    const metadata = await generateMetadata(params('JohnDoe'));

    expect(metadata.alternates?.canonical).toBe('https://serplists.com/profile/johndoe');
    expect(metadata.openGraph?.url).toBe('https://serplists.com/profile/johndoe');
  });

  it('names the official library profile, whose templates ship with the app', async () => {
    const result = await loadProfilePageSeo('serp');

    expect(result.kind).toBe('found');
    expect(result.kind === 'found' && result.seo.path).toBe('/profile/serp');
  });
});

describe('profile page metadata for a profile that is not there', () => {
  it('keeps a missing profile out of search', async () => {
    const metadata = await generateMetadata(params('nobody-here'));

    expect(metadata.robots).toBe('noindex, nofollow');
    expect(metadata.title).toEqual({ absolute: `Profile not found | ${APP_BRAND_NAME}` });
    // The address is not a page, so it names no canonical URL.
    expect(metadata.alternates?.canonical).toBeUndefined();
    expect(metadata.openGraph?.url).toBeUndefined();
  });

  it('keeps a blank username out of search without asking the API', async () => {
    serverContext.env = { DB: failingD1, BETTER_AUTH_SECRET: API_SECRET };

    expect((await loadProfilePageSeo('  ')).kind).toBe('not_found');
  });

  it('keeps the site defaults, indexable, when the lookup fails', async () => {
    serverContext.env = { DB: failingD1, BETTER_AUTH_SECRET: API_SECRET };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await loadProfilePageSeo('johndoe')).toEqual({ kind: 'unavailable' });
    expect(await generateMetadata(params('johndoe'))).toEqual({});
  });
});
