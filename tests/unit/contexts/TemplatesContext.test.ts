import { describe, it, expect } from 'vitest';

import { buildCreateRunRequest, mapApiTemplate } from '@/contexts/TemplatesContext';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

const buildRunTemplate = (
  overrides: Partial<ChecklistTemplate> = {},
): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Launch Checklist',
  description: '',
  sections: [
    {
      id: 'section-1',
      title: 'Prep',
      items: [
        {
          id: 'item-1',
          title: 'Confirm owner',
          isCompleted: true,
        },
      ],
    },
  ],
  userId: 'user-1',
  createdAt: '2026-07-03T12:00:00.000Z',
  updatedAt: '2026-07-03T12:00:00.000Z',
  isPublic: true,
  categories: [],
  tags: [],
  version: 1,
  ...overrides,
});

describe('buildCreateRunRequest', () => {
  it('uses a server-side template snapshot for database-backed templates', () => {
    const request = buildCreateRunRequest({
      activeTeamId: 'team-1',
      runName: 'Client Run',
      template: buildRunTemplate(),
      templateId: 'template-1',
    });

    expect(request.apiPayload).toEqual({
      teamId: 'team-1',
      template_id: 'template-1',
      title: 'Client Run',
      status: 'in_progress',
    });
    expect(request.runSections[0]?.items[0]?.isCompleted).toBe(false);
  });

  it('sends sections directly for frontend-only repo templates', () => {
    const request = buildCreateRunRequest({
      activeTeamId: 'team-1',
      template: buildRunTemplate({
        id: 'repo:launch-checklist',
        userId: REPO_TEMPLATE_USER_ID,
      }),
      templateId: 'repo:launch-checklist',
    });

    expect(request.apiPayload).toEqual({
      teamId: 'team-1',
      title: 'Launch Checklist',
      sections: request.runSections,
      status: 'in_progress',
    });
    expect(request.apiPayload).not.toHaveProperty('template_id');
    expect(request.runSections[0]?.items[0]?.isCompleted).toBe(false);
  });

  it.each([
    ['another Organization', 'team-a'],
    ['Personal', undefined],
  ])('runs a private Organization Template in its own Organization while %s is active, since the detail page opens it from any context', (_name, activeTeamId) => {
    const request = buildCreateRunRequest({
      activeTeamId,
      template: buildRunTemplate({ isPublic: false, teamId: 'team-b' }),
      templateId: 'template-1',
    });

    expect(request.apiPayload.teamId).toBe('team-b');
  });

  it.each([
    ['a public Organization Template', { isPublic: true, teamId: 'team-b' }],
    ["the user's own private Personal Template", { isPublic: false, teamId: undefined }],
    ["another user's public Template", { isPublic: true, userId: 'user-2' }],
  ])('runs %s in the active context', (_name, overrides) => {
    const request = buildCreateRunRequest({
      activeTeamId: 'team-a',
      template: buildRunTemplate(overrides),
      templateId: 'template-1',
    });

    expect(request.apiPayload.teamId).toBe('team-a');
  });
});

const textBlock = { id: 'content-1', type: 'text', value: 'Some text content' };
const subItemsBlock = (secondSubItem: Record<string, unknown>) => ({
  id: 'content-2',
  type: 'subItems',
  value: '',
  subItems: [
    { id: 'sub-1', title: 'Sub-item 1', isCompleted: true },
    { id: 'sub-2', title: 'Sub-item 2', ...secondSubItem },
  ],
});

const importedSections = [
  {
    id: 'section-1',
    title: 'Imported Section',
    items: [
      {
        id: 'item-1',
        title: 'Item with description',
        description: 'This is a detailed description',
        contents: [textBlock, subItemsBlock({})],
      },
      { id: 'item-2', title: 'Simple item', description: 'Just a simple item' },
    ],
  },
];

const storedTemplateRow = (items: unknown, overrides: Record<string, unknown> = {}) => ({
  id: 'imported-1',
  title: 'Imported Template',
  user_id: 'user-1',
  is_public: 1,
  items,
  ...overrides,
});

describe('mapApiTemplate on an imported template as the API stores it', () => {
  it("keeps every task's description, content blocks and Sub-tasks", () => {
    const [section] = mapApiTemplate(storedTemplateRow(JSON.stringify(importedSections))).sections;

    expect(section.items.map((item) => item.description)).toEqual(['This is a detailed description', 'Just a simple item']);
    expect(section.items[0].contents).toEqual([textBlock, subItemsBlock({ isCompleted: false })]);
  });

  it('reads the items column the same whether it arrives as JSON text or as an array', () => {
    expect(mapApiTemplate(storedTemplateRow(importedSections)).sections).toEqual(
      mapApiTemplate(storedTemplateRow(JSON.stringify(importedSections))).sections,
    );
  });

  it('wraps a legacy flat item list in one Checklist section', () => {
    const { sections } = mapApiTemplate(storedTemplateRow(JSON.stringify([{ id: 'item-1', title: 'Item 1', completed: false }])));

    expect(sections).toEqual([
      { id: '1', title: 'Checklist', items: [expect.objectContaining({ id: 'item-1', title: 'Item 1', isCompleted: false })] },
    ]);
  });

  it('keeps the categories, the tags stored as JSON text and the visibility', () => {
    const template = mapApiTemplate(
      storedTemplateRow(JSON.stringify(importedSections), { categories: ['test'], tags: '["imported","test"]' }),
    );

    expect(template).toMatchObject({ categories: ['test'], tags: ['imported', 'test'], isPublic: true });
  });
});

describe('buildCreateRunRequest from an imported template', () => {
  it("carries every task's title, description and content blocks into the run, with every task and Sub-task unticked", () => {
    const template = mapApiTemplate(storedTemplateRow(JSON.stringify(importedSections)));

    const [section] = buildCreateRunRequest({ template, templateId: template.id }).runSections;

    expect(section.items[0]).toMatchObject({
      title: 'Item with description',
      description: 'This is a detailed description',
      isCompleted: false,
      contents: [
        { id: 'content-1', type: 'text', value: 'Some text content' },
        {
          id: 'content-2',
          type: 'subItems',
          subItems: [
            { id: 'sub-1', title: 'Sub-item 1', isCompleted: false },
            { id: 'sub-2', title: 'Sub-item 2', isCompleted: false },
          ],
        },
      ],
    });
  });
});

describe('run titles taken from long template titles', () => {
  it('keeps the run title within the 160-character run limit', () => {
    const request = buildCreateRunRequest({
      template: buildRunTemplate({ title: 'Long title '.repeat(20) }),
      templateId: 'template-1',
    });

    expect(request.title.length).toBeLessThanOrEqual(160);
    expect(request.apiPayload.title).toBe(request.title);
  });
});

describe('mapApiTemplate', () => {
  it('keeps the owner type of a public catalog row, which names no team_id, to tell an Organization template from a Personal one', () => {
    const base = { id: 't1', title: 'Plan', sections: [], user_id: 'user-1', is_public: true };

    expect(mapApiTemplate({ ...base, owner_type: 'team' })).toMatchObject({ ownerType: 'team', teamId: undefined });
    expect(mapApiTemplate({ ...base, owner_type: 'user' }).ownerType).toBe('user');
    expect(mapApiTemplate({ ...base, owner_type: 'other' }).ownerType).toBeUndefined();
    expect(mapApiTemplate({ ...base, owner_type: 'team', team_id: 'org-1' }).teamId).toBe('org-1');
  });

  it('dates a template that was never edited, whose updated_at is null, by its creation', () => {
    const row = { id: 't1', title: 'Plan', sections: [], created_at: '2026-01-02 03:04:05', updated_at: null };

    expect(mapApiTemplate(row).updatedAt).toBe('2026-01-02 03:04:05');
  });
});
