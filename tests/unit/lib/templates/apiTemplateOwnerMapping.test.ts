import { describe, expect, it } from 'vitest';

import { mapApiTemplateToChecklistTemplate } from '@/features/template-detail/templateDetailMappers';
import { apiTemplateListSchema, apiTemplateSchema, type ApiTemplate } from '@/lib/schemas/apiTemplates';
import { mapApiTemplate } from '@/lib/templates/apiTemplateMapper';
import { readApiTemplateOwner } from '@/lib/templates/apiTemplateOwner';
import type { ChecklistTemplate } from '@/types/checklist';

const THE_ORGANIZATION = { type: 'team', teamId: 'org-1', publicHandle: 'launch-crew', displayName: 'Launch Crew' } as const;
const THE_USER = { type: 'user', userId: 'user-9', publicHandle: 'bob', displayName: 'Bob Owner' } as const;

const organizationRow = {
  id: 'template-1',
  title: 'Launch plan',
  sections: [],
  user_id: 'creator-1',
  owner_type: 'team',
  team_id: 'org-1',
  owner_username: 'alice',
  owner_full_name: 'Alice Creator',
};

const personalRow = {
  id: 'template-2',
  title: 'My plan',
  sections: [],
  user_id: 'user-9',
  owner_type: 'user',
  team_id: null,
  owner_username: 'bob',
  owner_full_name: 'Bob Owner',
};

const { team_id: teamIdPublicRowsLeftOut, ...publicOrganizationRowFromBeforeTheOwner } = organizationRow;

const asReceived = (body: Record<string, unknown>): ApiTemplate => apiTemplateSchema.parse(body);

const MAPPERS: Array<[string, (template: ApiTemplate) => ChecklistTemplate]> = [
  ['the Template list mapper', mapApiTemplate],
  ['the Template page mapper', (template) => mapApiTemplateToChecklistTemplate(template, 'fallback-slug')],
];

describe('the API Template schema', () => {
  it("reads the owner the API sends, a User's or an Organization's", () => {
    expect(asReceived({ ...personalRow, owner: THE_USER }).owner).toEqual(THE_USER);
    expect(asReceived({ ...organizationRow, owner: THE_ORGANIZATION }).owner).toEqual(THE_ORGANIZATION);
  });

  it('keeps only the owner fields it knows', () => {
    const owner = { ...THE_ORGANIZATION, billingOwnerUserId: 'creator-1' };

    expect(asReceived({ ...organizationRow, owner }).owner).toEqual(THE_ORGANIZATION);
  });

  it('reads a row with no owner, as an edge-cached response from before the owner was added sends it', () => {
    const template = asReceived(personalRow);

    expect(template.id).toBe('template-2');
    expect(template.owner).toBeUndefined();
  });

  it('keeps every row of a list, whether its owner is there, missing or unreadable', () => {
    const rows = apiTemplateListSchema.parse([
      { ...personalRow, owner: THE_USER },
      publicOrganizationRowFromBeforeTheOwner,
      { ...organizationRow, owner: { type: 'organization', organizationId: 'org-1' } },
    ]);

    expect(rows.map(({ id, owner }) => [id, owner])).toEqual([
      ['template-2', THE_USER],
      ['template-1', undefined],
      ['template-1', undefined],
    ]);
  });
});

describe.each(MAPPERS)('%s', (_label, map) => {
  it("keeps the owner's type, id, handle and name from the API", () => {
    expect(map(asReceived({ ...personalRow, owner: THE_USER })).owner).toEqual(THE_USER);
    expect(map(asReceived({ ...organizationRow, owner: THE_ORGANIZATION })).owner).toEqual(THE_ORGANIZATION);
  });

  it('keeps the legacy owner fields beside the owner', () => {
    const template = map(asReceived({ ...organizationRow, owner: THE_ORGANIZATION }));

    expect(template).toMatchObject({ userId: 'creator-1', teamId: 'org-1', ownerType: 'team' });
    expect(template.ownerProfile).toEqual({ username: 'alice', full_name: 'Alice Creator' });
  });

  it('derives the same Personal owner from the legacy fields of a response without one', () => {
    expect(map(asReceived(personalRow)).owner).toEqual(THE_USER);
  });

  it('derives the Organization, never its Creator, as the owner of a response without one', () => {
    expect(map(asReceived(organizationRow)).owner).toEqual({
      type: 'team',
      teamId: 'org-1',
      publicHandle: null,
      displayName: null,
    });
  });

  it('keeps a public Organization Template from before the owner was added, whose Organization the response does not name, with no owner', () => {
    const template = map(asReceived(publicOrganizationRowFromBeforeTheOwner));

    expect(template).toMatchObject({ id: 'template-1', ownerType: 'team', userId: 'creator-1' });
    expect(template.owner).toBeUndefined();
  });

  it('falls back to the legacy fields when the owner cannot be read', () => {
    const unreadable = { type: 'organization', organizationId: 'org-1' };

    expect(map(asReceived({ ...personalRow, owner: unreadable })).owner).toEqual(THE_USER);
  });
});

describe('readApiTemplateOwner on rows from older APIs', () => {
  it('reads the Organization from a row with no owner type', () => {
    expect(readApiTemplateOwner({ team_id: 'org-1', user_id: 'creator-1' })).toEqual({
      type: 'team',
      teamId: 'org-1',
      publicHandle: null,
      displayName: null,
    });
  });

  it('leaves a row with no owner and no user with no owner', () => {
    expect(readApiTemplateOwner({ owner_type: 'user', user_id: '' })).toBeUndefined();
  });
});
