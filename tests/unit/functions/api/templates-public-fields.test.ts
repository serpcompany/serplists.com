import { describe, it, expect, beforeEach, vi } from 'vitest';

// Public template responses (the edge-cached catalog, Public Profiles, and slug or id reads
// by anyone other than the owner or an Organization member) must not say who in an
// Organization created or edited a template, or which Organization owns it.

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const db = { select: vi.fn(() => selectChain) };
  return { selectChain, db };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';

// The whole public shape. A new column stays out of public responses until someone adds
// it here and to the server allowlist on purpose.
const PUBLIC_KEYS = [
  'categories',
  'created_at',
  'description',
  'id',
  'is_public',
  'ownerProfile',
  'owner_full_name',
  'owner_type',
  'owner_username',
  'rules',
  'sections',
  'seoDescription',
  'seoTitle',
  'slug',
  'tags',
  'title',
  'type',
  'updated_at',
  'user_id',
  'version',
];

const sections = [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Check DNS' }] }];

// A public Organization template that Carol (editor-2) edited after Alice created it.
const organizationRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'template-1',
  user_id: 'creator-1',
  title: 'Launch plan',
  description: 'Steps to launch',
  items: JSON.stringify(sections),
  version: 4,
  content_version: 2,
  type: 'checklist',
  seo_title: 'Launch',
  seo_description: 'Launch steps',
  rules: '[]',
  owner_type: 'team',
  team_id: 'org-1',
  created_by_user_id: 'creator-1',
  updated_by_user_id: 'editor-2',
  is_public: 1,
  category: '["ops"]',
  tags: '["launch"]',
  slug: 'launch-plan',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
  deleted_at: null,
  owner_username: 'alice',
  owner_full_name: 'Alice Example',
  ...overrides,
});

const personalRow = (overrides: Record<string, unknown> = {}) =>
  organizationRow({
    id: 'template-2',
    user_id: 'user-9',
    owner_type: 'user',
    team_id: null,
    created_by_user_id: 'user-9',
    updated_by_user_id: 'user-9',
    slug: 'my-plan',
    ...overrides,
  });

const activeMembership = { id: 'member-1', team_id: 'org-1', user_id: 'member-7', role: 'viewer', status: 'active' };

const sortedKeys = (value: Record<string, unknown>) => Object.keys(value).sort();

const expectPublicShape = (template: Record<string, unknown>) => {
  expect(sortedKeys(template)).toEqual(PUBLIC_KEYS);
  expect(template).not.toHaveProperty('team_id');
  expect(template).not.toHaveProperty('created_by_user_id');
  expect(template).not.toHaveProperty('updated_by_user_id');
  expect(template).not.toHaveProperty('deleted_at');
};

async function get(path: string) {
  const response = await handleTemplates(new Request(`http://localhost${path}`), { DB: {} } as never);
  return { status: response.status, body: await response.json() };
}

describe('public template responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockReset().mockResolvedValue([]);
    dbMocks.selectChain.limit.mockReset().mockResolvedValue([]);
    vi.mocked(getSessionUserId).mockResolvedValue(null);
  });

  it.each([
    ['the catalog', '/api/templates?scope=public'],
    ['the anonymous unscoped list', '/api/templates'],
  ])('%s sends only public fields for an Organization template', async (_label, path) => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([organizationRow()]);

    const { status, body } = await get(path);

    expect(status).toBe(200);
    expectPublicShape(body[0]);
    expect(body[0]).toMatchObject({ id: 'template-1', user_id: 'creator-1', owner_type: 'team', version: 4 });
    expect(body[0].sections).toEqual(sections);
  });

  it.each([
    ['by slug', '/api/templates/slug/launch-plan'],
    ['by id', '/api/templates/template-1'],
  ])('an anonymous read %s sends only public fields', async (_label, path) => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([organizationRow()]);

    const { status, body } = await get(path);

    expect(status).toBe(200);
    expectPublicShape(body);
    expect(body.ownerProfile).toEqual({ username: 'alice', full_name: 'Alice Example' });
  });

  it('a signed-in visitor who is not in the Organization gets only public fields', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('visitor-3');
    dbMocks.selectChain.limit.mockResolvedValueOnce([organizationRow()]).mockResolvedValueOnce([]);

    const { status, body } = await get('/api/templates/template-1');

    expect(status).toBe(200);
    expectPublicShape(body);
  });

  it('the catalog sends only public fields even for the signed-in owner, because it is cached for everyone', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-9');
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([personalRow()]);

    const { body } = await get('/api/templates?scope=public');

    expectPublicShape(body[0]);
  });

  it('a Public Profile sends only public fields', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([personalRow()]);

    const { status, body } = await get('/api/templates/public?userId=user-9');

    expect(status).toBe(200);
    expectPublicShape(body[0]);
  });

  it('the signed-in unscoped list keeps full rows for the user\'s own templates only', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-9');
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([personalRow({ is_public: 0 }), organizationRow()]);

    const { body } = await get('/api/templates');

    expect(body[0]).toMatchObject({ id: 'template-2', updated_by_user_id: 'user-9', owner_type: 'user' });
    expectPublicShape(body[1]);
  });

  it('an Organization member reading by slug still gets the full row', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('member-7');
    dbMocks.selectChain.limit.mockResolvedValueOnce([organizationRow()]).mockResolvedValueOnce([activeMembership]);

    const { status, body } = await get('/api/templates/slug/launch-plan');

    expect(status).toBe(200);
    expect(body).toMatchObject({ team_id: 'org-1', created_by_user_id: 'creator-1', updated_by_user_id: 'editor-2' });
  });

  it('the owner reading a public Personal template by id still gets the full row', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-9');
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRow()]);

    const { body } = await get('/api/templates/template-2');

    expect(body).toMatchObject({ id: 'template-2', updated_by_user_id: 'user-9', content_version: 2 });
  });

  it('an Organization member listing the Organization\'s templates still gets full rows', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('member-7');
    dbMocks.selectChain.limit.mockResolvedValueOnce([activeMembership]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([organizationRow()]);

    const { body } = await get('/api/templates?teamId=org-1');

    expect(body[0]).toMatchObject({ team_id: 'org-1', updated_by_user_id: 'editor-2' });
  });

  it('a private Organization template is still not found for a non-member', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('visitor-3');
    dbMocks.selectChain.limit.mockResolvedValueOnce([organizationRow({ is_public: 0 })]).mockResolvedValueOnce([]);

    const { status } = await get('/api/templates/template-1');

    expect(status).toBe(404);
  });
});
