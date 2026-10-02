import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../../support/elements';
import {
  createdBody,
  dbMocks,
  expectTheOrganizationOwnsIt,
  expectTheOrganizationPlanChecked,
  mockEnv,
  resetTemplatesHandlerMocks,
  TEAM_PLAN,
} from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { getEntitlementsForContext } from '@functions/api/utils/entitlements';
import { activeMember } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { columnNamesIn } from '../../../support/drizzleSql';
import { apiErrorBody, readJson } from '../../../support/readJson';
import { anyInstanceOf } from '../../../support/asymmetricMatchers';
import { storedSectionsIn } from '../../../support/storedJson';

const postTemplate = (body: Record<string, unknown>) => handleTemplates(apiRequest('templates', 'POST', body), mockEnv);

const insertedTemplate = () => firstOf(dbMocks.insertChain.values.mock.calls)[0];

async function expectCreated(response: Response) {
  const data = await readJson(response, createdBody);

  expect(response.status).toBe(200);
  expect(data.id).toBeDefined();
  return data;
}

describe('Templates Handlers', () => {
  beforeEach(resetTemplatesHandlerMocks);

  it('should reject unauthenticated template creation', async () => {
    const response = await postTemplate({ title: 'New Template' });
    expect(response.status).toBe(401);
  });

  it('creates templates storing sections JSON, last active at creation so "Most Recent" can sort them', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const data = await expectCreated(await postTemplate({
      title: 'New Template',
      items: [{ id: 'item-1', title: 'Item 1' }],
      tags: ['alpha'],
    }));

    expect(data.slug).toBeDefined();

    const inserted = insertedTemplate();
    const storedItems = storedSectionsIn(inserted.items);
    const personalLimitPredicate = firstOf(dbMocks.selectChain.where.mock.calls)[0];
    const personalLimitColumns = columnNamesIn(personalLimitPredicate);
    expect(Array.isArray(storedItems)).toBe(true);
    expect(firstOf(storedItems).items).toHaveLength(1);
    expect(inserted.version).toBe(1);
    expect(inserted.updated_at).toEqual(anyInstanceOf(String));
    expect(inserted.updated_at).toBe(inserted.created_at);
    expect(personalLimitColumns).toContain('owner_type');
    expect(personalLimitColumns).toContain('user_id');
    expect(personalLimitColumns).toContain('team_id');
    expect(personalLimitColumns).toContain('deleted_at');
  });

  it('should create team-owned templates for team editors', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForContext).mockResolvedValue(TEAM_PLAN);
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([activeMember('editor')])
      .mockResolvedValueOnce([]);

    await expectCreated(await postTemplate({
      teamId: 'team-1',
      title: 'Team Template',
      sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
    }));

    expectTheOrganizationPlanChecked();
    expectTheOrganizationOwnsIt(insertedTemplate());
  });

  it('should persist requested SEO metadata and slug on template creation', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const response = await postTemplate({
      title: 'SEO Template',
      seoTitle: 'SEO Title',
      seoDescription: 'Search-ready description',
      rules: [
        {
          id: 'rule-1',
          type: 'required-field',
          path: 'sections[].items[].title',
          value: 'Every item needs a title',
          severity: 'error',
        },
      ],
      slug: 'custom-seo-template',
      sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
    });

    expect(response.status).toBe(200);

    const inserted = insertedTemplate();
    expect(inserted.slug).toBe('custom-seo-template');
    expect(inserted.seo_title).toBe('SEO Title');
    expect(inserted.seo_description).toBe('Search-ready description');
    expect(inserted.rules).toContain('required-field');
  });

  it('should enforce free plan template limit', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 1 }]);

    const response = await postTemplate({
      title: 'New Template',
      items: [{ id: 'item-1', title: 'Item 1' }],
    });
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(403);
    expect(data.code).toBe('limit_reached');
  });
});
