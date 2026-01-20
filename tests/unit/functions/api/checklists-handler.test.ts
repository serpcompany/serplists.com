import { describe, it, expect, beforeEach, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = {
    values: vi.fn(),
  };
  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  const deleteChain = {
    where: vi.fn(),
  };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    delete: vi.fn(() => deleteChain),
  };

  return { selectChain, insertChain, updateChain, deleteChain, db };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock('@functions/api/utils/jwt', () => ({
  verifyJWT: vi.fn(),
}));

import { handleChecklists } from '@functions/api/handlers/checklists';
import { verifyJWT } from '@functions/api/utils/jwt';

describe('Checklists Handlers', () => {
  let mockEnv: any;

  beforeEach(() => {
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockResolvedValue(undefined);
    dbMocks.deleteChain.where.mockResolvedValue(undefined);

    mockEnv = {
      DB: {},
      JWT_SECRET: 'test-secret',
    };

    vi.mocked(verifyJWT).mockResolvedValue(null);
  });

  it('should reject unauthenticated access', async () => {
    const request = new Request('http://localhost/api/checklists', { method: 'GET' });

    const response = await handleChecklists(request, mockEnv);
    expect(response.status).toBe(401);
  });

  it('should create checklist runs from legacy items', async () => {
    vi.mocked(verifyJWT).mockResolvedValue('user-123');

    const request = new Request('http://localhost/api/checklists', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: JSON.stringify({
        title: 'Run',
        items: [{ id: 'item-1', title: 'Item 1' }],
      }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    const storedItems = JSON.parse(inserted.items);
    expect(storedItems[0].items).toHaveLength(1);
  });

  it('should reject empty update payloads', async () => {
    vi.mocked(verifyJWT).mockResolvedValue('user-123');

    const request = new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      headers: { Authorization: 'Bearer test-token' },
      body: JSON.stringify({}),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/No fields to update/i);
  });
});
