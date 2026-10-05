import { describe, it, expect, beforeEach, vi } from 'vitest';
import { elementAt, firstOf } from '../../../support/elements';
import { dbMocks } from '../../../support/mockedDrizzleD1';
import { z } from 'zod';
import { chainSelectsUpdatesAndDeletes } from '../../../support/drizzleChainMocks';

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

import { handleTemplates } from '@functions/api/handlers/templates';
import { toPublicTemplate } from '@functions/api/utils/template-public';
import type { TemplateOwner } from '@/lib/schemas/templateOwner';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiEnv } from '../../../support/apiEnv';
import { readJson } from '../../../support/readJson';
import type { ResponseSchema } from '@/lib/api/request';

const EVERY_ALLOWLISTED_PUBLIC_FIELD = [
  'categories',
  'created_at',
  'description',
  'id',
  'is_public',
  'owner',
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

const organizationTemplateAnotherMemberEdited = (overrides: Record<string, unknown> = {}) => ({
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
  is_public: true,
  category: '["ops"]',
  tags: '["launch"]',
  slug: 'launch-plan',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
  deleted_at: null,
  owner_username: 'alice',
  owner_full_name: 'Alice Example',
  owner_team_slug: 'launch-crew',
  owner_team_name: 'Launch Crew',
  ...overrides,
});

const personalRow = (overrides: Record<string, unknown> = {}) =>
  organizationTemplateAnotherMemberEdited({
    id: 'template-2',
    user_id: 'user-9',
    owner_type: 'user',
    team_id: null,
    created_by_user_id: 'user-9',
    updated_by_user_id: 'user-9',
    slug: 'my-plan',
    owner_team_slug: null,
    owner_team_name: null,
    ...overrides,
  });

const activeMembership = { id: 'member-1', team_id: 'org-1', user_id: 'member-7', role: 'viewer', status: 'active' };

const sortedKeys = (value: Record<string, unknown>) => Object.keys(value).sort();

const THE_ORGANIZATION_AS_OWNER: TemplateOwner = { type: 'team', teamId: 'org-1', publicHandle: 'launch-crew', displayName: 'Launch Crew' };
const THE_USER_AS_OWNER: TemplateOwner = { type: 'user', userId: 'user-9', publicHandle: 'alice', displayName: 'Alice Example' };
const THE_ORGANIZATION_IN_PUBLIC = { type: 'team', publicHandle: 'launch-crew', displayName: 'Launch Crew' };
const AN_ORGANIZATION_UNNAMED = { type: 'team' };
const THE_ORGANIZATION_BY_ID = /org-1/;
const THE_ORGANIZATION_BY_SLUG_OR_NAME = /launch-crew|Launch Crew/;

const publicOwner = z.object({ owner: z.object({ type: z.string() }).passthrough() }).passthrough();

const expectPublicShape = (template: Record<string, unknown>) => {
  expect(sortedKeys(template)).toEqual(EVERY_ALLOWLISTED_PUBLIC_FIELD);
  expect(template).not.toHaveProperty('team_id');
  expect(template).not.toHaveProperty('created_by_user_id');
  expect(template).not.toHaveProperty('updated_by_user_id');
  expect(template).not.toHaveProperty('deleted_at');
  expect(template).not.toHaveProperty('owner_team_slug');
  expect(template).not.toHaveProperty('owner_team_name');
  const { owner } = publicOwner.parse(template);
  expect(owner.type === 'team' ? owner : sortedKeys(owner)).toEqual(
    owner.type === 'team' ? THE_ORGANIZATION_IN_PUBLIC : ['displayName', 'publicHandle', 'type', 'userId'],
  );
  expect(JSON.stringify(template)).not.toMatch(THE_ORGANIZATION_BY_ID);
};

const templateRow = z.object({ sections: z.unknown(), ownerProfile: z.unknown(), owner: z.unknown() }).passthrough();
const templateRows = z.array(templateRow);

async function get<Output>(path: string, schema: ResponseSchema<Output>) {
  const response = await handleTemplates(new Request(`http://localhost${path}`), apiEnv());
  return { status: response.status, body: await readJson(response, schema) };
}

describe("public template responses, which never say who in an Organization created or edited a template, or the owning Organization's id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainSelectsUpdatesAndDeletes(dbMocks);
    dbMocks.selectChain.orderBy.mockReset().mockResolvedValue([]);
    dbMocks.selectChain.limit.mockReset().mockResolvedValue([]);
    vi.mocked(getSessionUserId).mockResolvedValue(null);
  });

  it.each([
    ['the catalog', '/api/templates?scope=public'],
    ['the anonymous unscoped list', '/api/templates'],
  ])('%s sends only public fields for an Organization template', async (_label, path) => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([organizationTemplateAnotherMemberEdited()]);

    const { status, body } = await get(path, templateRows);

    expect(status).toBe(200);
    expectPublicShape(firstOf(body));
    expect(body[0]).toMatchObject({ id: 'template-1', user_id: 'creator-1', owner_type: 'team', version: 4 });
    expect(firstOf(body).sections).toEqual(sections);
    expect(firstOf(body).owner).toEqual(THE_ORGANIZATION_IN_PUBLIC);
  });

  it('only says an Organization owns a template once the Organization is archived, naming neither its handle nor its name', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      organizationTemplateAnotherMemberEdited({ owner_team_archived_at: '2026-09-03T00:00:00.000Z' }),
    ]);

    const { body } = await get('/api/templates?scope=public', templateRows);

    expect(firstOf(body).owner).toEqual(AN_ORGANIZATION_UNNAMED);
    expect(JSON.stringify(body)).not.toMatch(THE_ORGANIZATION_BY_SLUG_OR_NAME);
    expect(firstOf(body)).not.toHaveProperty('owner_team_archived_at');
  });

  it.each([
    ['by slug', '/api/templates/slug/launch-plan'],
    ['by id', '/api/templates/template-1'],
  ])('an anonymous read %s sends only public fields', async (_label, path) => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([organizationTemplateAnotherMemberEdited()]);

    const { status, body } = await get(path, templateRow);

    expect(status).toBe(200);
    expectPublicShape(body);
    expect(body.ownerProfile).toEqual({ username: 'alice', full_name: 'Alice Example' });
    expect(body.owner).toEqual(THE_ORGANIZATION_IN_PUBLIC);
  });

  it('a signed-in visitor who is not in the Organization gets only public fields', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('visitor-3');
    dbMocks.selectChain.limit.mockResolvedValueOnce([organizationTemplateAnotherMemberEdited()]).mockResolvedValueOnce([]);

    const { status, body } = await get('/api/templates/template-1', templateRow);

    expect(status).toBe(200);
    expectPublicShape(body);
  });

  it('the catalog sends only public fields even for the signed-in owner, because it is cached for everyone', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-9');
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([personalRow()]);

    const { body } = await get('/api/templates?scope=public', templateRows);

    expectPublicShape(firstOf(body));
  });

  it('a Public Profile sends only public fields', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([personalRow()]);

    const { status, body } = await get('/api/templates/public?userId=user-9', templateRows);

    expect(status).toBe(200);
    expectPublicShape(firstOf(body));
    expect(firstOf(body).owner).toEqual(THE_USER_AS_OWNER);
  });

  it('the signed-in unscoped list keeps full rows for the user\'s own templates only', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-9');
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([personalRow({ is_public: false }), organizationTemplateAnotherMemberEdited()]);

    const { body } = await get('/api/templates', templateRows);

    expect(body[0]).toMatchObject({ id: 'template-2', updated_by_user_id: 'user-9', owner_type: 'user' });
    expectPublicShape(elementAt(body, 1));
  });

  it('an Organization member reading by slug still gets the full row', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('member-7');
    dbMocks.selectChain.limit.mockResolvedValueOnce([organizationTemplateAnotherMemberEdited()]).mockResolvedValueOnce([activeMembership]);

    const { status, body } = await get('/api/templates/slug/launch-plan', templateRow);

    expect(status).toBe(200);
    expect(body).toMatchObject({ team_id: 'org-1', created_by_user_id: 'creator-1', updated_by_user_id: 'editor-2' });
    expect(body.owner).toEqual(THE_ORGANIZATION_AS_OWNER);
  });

  it('the owner reading a public Personal template by id still gets the full row', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-9');
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRow()]);

    const { body } = await get('/api/templates/template-2', templateRow);

    expect(body).toMatchObject({ id: 'template-2', updated_by_user_id: 'user-9', content_version: 2 });
  });

  it('an Organization member listing the Organization\'s templates still gets full rows', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('member-7');
    dbMocks.selectChain.limit.mockResolvedValueOnce([activeMembership]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([organizationTemplateAnotherMemberEdited()]);

    const { body } = await get('/api/templates?teamId=org-1', templateRows);

    expect(body[0]).toMatchObject({ team_id: 'org-1', updated_by_user_id: 'editor-2' });
    expect(firstOf(body).owner).toEqual(THE_ORGANIZATION_AS_OWNER);
  });

  it('a private Organization template is still not found for a non-member', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('visitor-3');
    dbMocks.selectChain.limit.mockResolvedValueOnce([organizationTemplateAnotherMemberEdited({ is_public: false })]).mockResolvedValueOnce([]);

    const { status } = await get('/api/templates/template-1', templateRow);

    expect(status).toBe(404);
  });

  it('names an Organization only by its public handle and name, says only that one owns a template while it has no handle, and keeps only the public fields of a User owner', () => {
    const organization = { ...THE_ORGANIZATION_AS_OWNER, billingOwnerUserId: 'creator-1', memberIds: ['editor-2'], role: 'owner' };
    const user = { ...THE_USER_AS_OWNER, email: 'alice@example.test' };

    expect(toPublicTemplate({ id: 'template-1', owner: organization }).owner).toEqual(THE_ORGANIZATION_IN_PUBLIC);
    expect(toPublicTemplate({ id: 'template-1', owner: { ...organization, publicHandle: null } }).owner).toEqual(
      AN_ORGANIZATION_UNNAMED,
    );
    expect(toPublicTemplate({ id: 'template-2', owner: user }).owner).toEqual(THE_USER_AS_OWNER);
  });
});
