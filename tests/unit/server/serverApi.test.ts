import { serveTheSiteFrom, serverContext } from '../../support/mockedServerContext';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { headersMock } from '../../support/nextServerContext';
import { ApiError, UNREADABLE_RESPONSE_CODE } from '@/lib/api-errors';
import { fetchApiJson } from '@/server/api';
import { getRequestOrigin } from '@/server/cloudflare';
import { SqliteD1 } from '../../support/sqlite-d1';

const rejectionOf = (promise: Promise<unknown>): Promise<unknown> => promise.then(() => null, (error: unknown) => error);

beforeEach(() => {
  serveTheSiteFrom(new SqliteD1());
  serverContext.protocol = 'https';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getRequestOrigin', () => {
  it('builds the origin from the host and the protocol the edge forwarded', async () => {
    serverContext.host = 'staging.serplists.com';
    serverContext.protocol = 'http, https';

    expect(await getRequestOrigin()).toBe('http://staging.serplists.com');
  });

  it('assumes https for any forwarded protocol other than http', async () => {
    serverContext.protocol = 'ftp';

    expect(await getRequestOrigin()).toBe('https://serplists.com');
  });

  it('falls back to https on localhost for a request with neither header', async () => {
    vi.spyOn(headersMock, 'headers').mockResolvedValue(new Headers());

    expect(await getRequestOrigin()).toBe('https://localhost');
  });
});

describe('fetchApiJson', () => {
  it('returns the body the schema reads', async () => {
    expect(await fetchApiJson('/api/health', z.object({ status: z.string() }))).toEqual({ status: 'ok' });
  });

  it('refuses a body the schema cannot read, as an unreadable response with the issues', async () => {
    const error = await rejectionOf(fetchApiJson('/api/health', z.object({ status: z.number() })));

    expect(error).toBeInstanceOf(ApiError);
    expect(error instanceof ApiError && error.code).toBe(UNREADABLE_RESPONSE_CODE);
    expect(error instanceof ApiError && error.status).toBe(200);
    expect(JSON.stringify(error instanceof ApiError && error.details)).toContain('status');
  });

  it('refuses a failed response with its status and the path it asked for', async () => {
    const error = await rejectionOf(fetchApiJson('/api/no-such-route?x=1', z.unknown()));

    expect(error instanceof ApiError && [error.status, error.message]).toEqual([404, 'GET /api/no-such-route failed']);
  });
});
