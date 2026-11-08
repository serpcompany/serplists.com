import { describe, expect, it } from 'vitest';

import {
  buildTemplateCopyPayload,
  mapApiTemplateToChecklistTemplate,
  resolveTemplateOwnerProfile,
} from '@/features/template-detail/templateDetailMappers';
import { toPublicTemplate } from '@functions/api/utils/template-public';
import { apiTemplateSchema } from '@/lib/schemas/apiTemplates';
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

  it("keeps the last update of a public template response, which the page's Updated date reads, falling back to its creation", () => {
    const row = { id: 'template-1', title: 'Launch', user_id: 'user-1', is_public: 1, created_at: '2026-01-05 12:00:00' };

    const asTheClientReadsIt = (stored: Record<string, unknown>) => apiTemplateSchema.parse(toPublicTemplate(stored));

    expect(mapApiTemplateToChecklistTemplate(asTheClientReadsIt({ ...row, updated_at: '2026-09-02 12:00:00' }), 'launch').updatedAt)
      .toBe('2026-09-02 12:00:00');
    expect(mapApiTemplateToChecklistTemplate(asTheClientReadsIt(row), 'launch').updatedAt).toBe('2026-01-05 12:00:00');
  });

  it.each([null, '', undefined])('leaves a Personal template without an Organization (team_id %s)', (teamId) => {
    const mapped = mapApiTemplateToChecklistTemplate({ id: 'template-1', title: 'Launch', user_id: 'user-1', team_id: teamId }, 'slug');

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

describe('mapApiTemplateToChecklistTemplate for rows stored before sections', () => {
  const sectionsOf = (items: unknown) =>
    mapApiTemplateToChecklistTemplate({ id: 'template-1', title: 'Old', items }, 'old').sections;

  it('reads items stored as JSON text into one Checklist section', () => {
    expect(sectionsOf(JSON.stringify([{ id: 'item-1', title: 'Pack the tent' }]))).toEqual([
      { id: '1', title: 'Checklist', items: [{ id: 'item-1', title: 'Pack the tent', isCompleted: false }] },
    ]);
  });

  it('reads items stored as a list into one Checklist section', () => {
    expect(sectionsOf([{ id: 'item-1', title: 'Pack the tent' }]).map((section) => section.items.map((item) => item.title))).toEqual([['Pack the tent']]);
  });

  it('shows no sections for items that are not a list or not readable', () => {
    expect(sectionsOf('{"title":"not a list"}')).toEqual([]);
    expect(sectionsOf('[not json')).toEqual([]);
  });

  it('names a row with no id or title as an untitled Template', () => {
    expect(mapApiTemplateToChecklistTemplate({ id: '', title: '' }, 'fallback')).toMatchObject({ id: '', title: 'Template', slug: 'fallback' });
  });
});

describe("resolveTemplateOwnerProfile, which names a template's owner from their profile", () => {
  it('keeps the full name the template already had when the profile has none', () => {
    const named = template({ ownerProfile: { username: 'alice', full_name: 'Alice Example' } });

    expect(resolveTemplateOwnerProfile(named, { username: 'alice-ng', full_name: null }).template.ownerProfile).toEqual({
      username: 'alice-ng',
      full_name: 'Alice Example',
    });
  });
});
