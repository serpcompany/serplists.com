import { describe, it, expect, beforeEach, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const db = {
    select: vi.fn(() => selectChain),
  };

  return { selectChain, db };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

import { handleProfileById, handleProfileByUsername } from '@functions/api/handlers/auth';

describe('Profiles Handlers', () => {
  let mockEnv: any;

  beforeEach(() => {
    dbMocks.db.select.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockReset();

    mockEnv = {
      DB: {},
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    };
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
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('user-1');
    expect(data.username).toBe('test');
  });
});

