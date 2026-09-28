import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pins the contract the template detail page relies on: the API, not the browser, decides
// whether a public template may be copied into a Free Organization.

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = { values: vi.fn() };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    batch: vi.fn(),
  };
  return { db, insertChain, selectChain };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

import { handleTemplates } from '@functions/api/handlers/templates';
import { getEntitlementsForContext } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

const membership = (role: string) => [
  { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role, status: 'active' },
];

const publicSource = [
  {
    id: 'template-1',
    title: 'Public Template',
    description: '',
    items: JSON.stringify([]),
    category: '[]',
    tags: '[]',
    user_id: 'other-user',
    is_public: true,
    slug: 'public-template',
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: null,
    version: 1,
  },
];

const cloneIntoOrganization = () =>
  handleTemplates(
    new Request('http://localhost/api/templates/template-1/clone', {
      method: 'POST',
      body: JSON.stringify({ teamId: 'team-1', visibility: 'private' }),
    }),
    { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as never,
  );

describe('POST /api/templates/:id/clone into an Organization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.db.batch.mockResolvedValue([]);
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForContext).mockResolvedValue({
      plan: 'free',
      limits: { maxTemplates: 1, maxActiveRuns: 3 },
    });
  });

  it('copies into a Free Organization that is under its Template limit', async () => {
    // limit() order: membership, Organization template count, source lookup, slug check.
    dbMocks.selectChain.limit
      .mockResolvedValueOnce(membership('editor'))
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce(publicSource);

    const response = await cloneIntoOrganization();

    expect(response.status).toBe(200);
    expect(vi.mocked(getEntitlementsForContext)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'team', teamId: 'team-1' }),
    );
  });

  it('reports limit_reached once the Free Organization is at its limit', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce(membership('editor'))
      .mockResolvedValueOnce([{ count: 1 }]);

    const response = await cloneIntoOrganization();
    const data = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(data.code).toBe('limit_reached');
  });

  it('refuses a role that cannot add Templates to the Organization', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce(membership('viewer'));

    const response = await cloneIntoOrganization();
    const data = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(data.code).toBeUndefined();
  });
});
