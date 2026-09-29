import { describe, expect, it } from 'vitest';

import {
  buildTemplateCopyPayload,
  mapApiTemplateToChecklistTemplate,
} from '@/features/template-detail/templateDetailMappers';
import { toPublicTemplate } from '@functions/api/utils/template-public';
import type { ChecklistTemplate } from '@/types/checklist';

const template = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Launch Checklist',
  description: 'Steps',
  sections: [{ id: 'section-1', title: 'Prep', items: [{ id: 'item-1', title: 'Confirm owner' }] }],
  userId: 'user-1',
  createdAt: '2026-07-03T12:00:00.000Z',
  updatedAt: '2026-07-03T12:00:00.000Z',
  isPublic: false,
  categories: ['ops'],
  tags: ['launch'],
  version: 3,
  ...overrides,
});

describe('mapApiTemplateToChecklistTemplate', () => {
  it("keeps the Organization that owns a template loaded by id", () => {
    const mapped = mapApiTemplateToChecklistTemplate(
      { id: 'template-1', title: 'Team Template', user_id: 'creator-1', owner_type: 'team', team_id: 'team-b' },
      'team-template',
    );

    expect(mapped.teamId).toBe('team-b');
  });

  // The public template page's "Updated <date>" reads the public response's updated_at, which
  // the API already sends (PUBLIC_TEMPLATE_FIELDS), so the page costs no extra read.
  it('keeps the last update of a public template response, falling back to its creation', () => {
    const row = { id: 'template-1', title: 'Launch', user_id: 'user-1', is_public: 1, created_at: '2026-01-05 12:00:00' };

    expect(mapApiTemplateToChecklistTemplate(toPublicTemplate({ ...row, updated_at: '2026-09-02 12:00:00' }), 'launch').updatedAt)
      .toBe('2026-09-02 12:00:00');
    expect(mapApiTemplateToChecklistTemplate(toPublicTemplate(row), 'launch').updatedAt).toBe('2026-01-05 12:00:00');
  });

  it.each([null, '', undefined])('leaves a Personal template without an Organization (team_id %s)', (teamId) => {
    const mapped = mapApiTemplateToChecklistTemplate({ id: 'template-1', user_id: 'user-1', team_id: teamId }, 'slug');

    expect(mapped.teamId).toBeUndefined();
  });
});

describe('buildTemplateCopyPayload', () => {
  it("keeps a private Organization Template's copy in its Organization, whatever context is active", () => {
    expect(buildTemplateCopyPayload(template({ teamId: 'team-b' }), 'team-a').teamId).toBe('team-b');
    expect(buildTemplateCopyPayload(template({ teamId: 'team-b' }), undefined).teamId).toBe('team-b');
  });

  it('copies other templates into the active context', () => {
    expect(buildTemplateCopyPayload(template(), 'team-a').teamId).toBe('team-a');
    expect(buildTemplateCopyPayload(template({ isPublic: true, teamId: 'team-b' }), 'team-a').teamId).toBe('team-a');
    expect(buildTemplateCopyPayload(template(), undefined).teamId).toBeUndefined();
  });

  it('copies the content under a new title and slug', () => {
    const source = template({ seoUrl: 'launch-checklist', seoTitle: 'SEO', rules: [] });

    expect(buildTemplateCopyPayload(source, undefined)).toEqual({
      categories: ['ops'],
      description: 'Steps',
      isPublic: false,
      rules: [],
      sections: source.sections,
      seoDescription: undefined,
      seoTitle: 'SEO',
      seoUrl: '',
      tags: ['launch'],
      teamId: undefined,
      title: 'Launch Checklist Copy',
      type: 'checklist',
    });
  });
});
