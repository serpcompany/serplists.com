import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMetadata } from '@/app/share/[shareToken]/page';
import { APP_BRAND_NAME } from '@/lib/brand';
import { loadSharedRunPageSeo } from '@/server/pageMeta/sharedRunPage';
import { unreachableD1, serverContext } from '../../../support/nextServerContext';
import { MigratedSqliteD1 } from '../../../support/sqlite-d1';

vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', async () => (await import('../../../support/nextServerContext')).cloudflareMock);
vi.mock('next/headers', async () => (await import('../../../support/nextServerContext')).headersMock);

let d1: MigratedSqliteD1;

const addRun = ({ title = 'Launch prep', shared = true, deleted = false } = {}) =>
  d1.run(
    `INSERT INTO checklist_runs (id, user_id, title, items, share_token, is_public, deleted_at, started_at, created_at)
     VALUES ('run-1', 'user-1', ?, '[]', 'share-token-1', ?, ?, '2026-01-01', '2026-01-01')`,
    title,
    shared ? 1 : 0,
    deleted ? '2026-02-01' : null,
  );

const params = (shareToken: string) => ({ params: Promise.resolve({ shareToken }) });

beforeEach(() => {
  d1 = new MigratedSqliteD1();
  d1.run(
    `INSERT INTO users (id, email, name, username, email_verified, created_at, updated_at)
     VALUES ('user-1', 'alice@example.test', 'Alice', 'alice', 1, '2026-01-01', '2026-01-01')`,
  );
  serverContext.env = { DB: d1.binding };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shared run page metadata', () => {
  it('names the shared run and keeps it out of search', async () => {
    addRun();

    const metadata = await generateMetadata(params('share-token-1'));

    expect(metadata.title).toEqual({ absolute: `Launch prep | ${APP_BRAND_NAME}` });
    expect(metadata.description).toBe('Shared checklist run for Launch prep');
    expect(metadata.robots).toBe('noindex, nofollow');
    expect(metadata.alternates?.canonical).toBe('https://serplists.com/share/share-token-1/');
  });

  it.each([
    ['a link that was turned off', { shared: false }],
    ['a deleted run', { deleted: true }],
  ])('names nothing for %s, since holding the link is the only credential, and stays out of search', async (_label, run) => {
    addRun(run);

    expect(await loadSharedRunPageSeo('share-token-1')).toBeNull();
    expect(await generateMetadata(params('share-token-1'))).toEqual({ robots: 'noindex, nofollow' });
  });

  it('names nothing for an unknown or blank token', async () => {
    addRun();

    expect(await loadSharedRunPageSeo('another-token')).toBeNull();
    expect(await loadSharedRunPageSeo('  ')).toBeNull();
  });

  it('stays out of search when the lookup fails', async () => {
    serverContext.env = { DB: unreachableD1 };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await generateMetadata(params('share-token-1'))).toEqual({ robots: 'noindex, nofollow' });
  });
});
