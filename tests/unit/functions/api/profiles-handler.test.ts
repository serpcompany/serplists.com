import { describe, it, expect, beforeEach } from 'vitest';
import { firstOf } from '../../../support/elements';
import { dbMocks } from '../../../support/mockedDrizzleD1';
import { z } from 'zod';
import { chainSelectsUpdatesAndDeletes } from '../../../support/drizzleChainMocks';

import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { sqlExpression } from '../../../support/drizzleSql';
import { handleProfileById, handleProfileByUsername } from '@functions/api/handlers/auth';
import { readJson } from '../../../support/readJson';
import { apiEnv } from '../../../support/apiEnv';
import type { Env } from '@functions/api/types';

const profileBody = z.object({ id: z.string(), username: z.string() }).passthrough();

const renderWhere = () => new SQLiteSyncDialect().sqlToQuery(sqlExpression(firstOf(dbMocks.selectChain.where.mock.calls)[0])).sql;

describe('Profiles Handlers', () => {
  let mockEnv: Env;

  beforeEach(() => {
    dbMocks.db.select.mockReturnValue(dbMocks.selectChain);
    chainSelectsUpdatesAndDeletes(dbMocks);
    dbMocks.selectChain.where.mockClear();
    dbMocks.selectChain.limit.mockReset();

    mockEnv = apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' });
  });

  it('GET /api/profiles/by-username requires username', async () => {
    const request = new Request('http://localhost/api/profiles/by-username');
    const response = await handleProfileByUsername(request, mockEnv);
    expect(response.status).toBe(400);
  });

  it('GET /api/profiles/by-id requires userId', async () => {
    const request = new Request('http://localhost/api/profiles/by-id');
    const response = await handleProfileById(request, mockEnv);
    expect(response.status).toBe(400);
  });

  it('GET /api/profiles/by-username returns profile data', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'user-1',
        full_name: 'Test User',
        username: 'test',
        avatar_url: 'https://example.com/a.png',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const request = new Request('http://localhost/api/profiles/by-username?username=test');
    const response = await handleProfileByUsername(request, mockEnv);
    const data = await readJson(response, profileBody);

    expect(response.status).toBe(200);
    expect(data.id).toBe('user-1');
    expect(data.username).toBe('test');
  });

  it('GET /api/profiles/by-id only resolves users with a public username, so an id from a public response names no one else', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const request = new Request('http://localhost/api/profiles/by-id?userId=member-2');
    const response = await handleProfileById(request, mockEnv);

    expect(response.status).toBe(404);
    expect(renderWhere()).toMatch(/"users"\."id" = \?/);
    expect(renderWhere()).toMatch(/"users"\."username" is not null/);
  });

  it('GET /api/profiles/by-id returns the public profile of a user with a username', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'user-1', full_name: 'Test User', username: 'test', avatar_url: null, created_at: '2026-01-01T00:00:00.000Z' },
    ]);

    const request = new Request('http://localhost/api/profiles/by-id?userId=user-1');
    const response = await handleProfileById(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ id: 'user-1', username: 'test' });
  });
});

