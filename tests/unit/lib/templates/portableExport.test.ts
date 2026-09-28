import { describe, expect, it } from 'vitest';
import { portableTemplatePackSchema } from '@/lib/schemas/checklistSchema';
import { addPublicTemplatesToPack, selectPublicTemplatesForExport } from '@/lib/templates/portableExport';
import { buildPortableTemplatePack } from '@functions/api/utils/template-portable';
import type { ChecklistTemplate } from '@/types/checklist';

const sections = [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Check DNS' }] }];
const template = (id: string, overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id,
  title: `Template ${id}`,
  description: '',
  sections,
  userId: 'other-user',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  isPublic: true,
  slug: id,
  categories: [],
  tags: [],
  ...overrides,
});

describe('adding public templates to an export', () => {
  // Catalog rows carry owner_type but no team_id: the API leaves Organization ids out of
  // public responses.
  const catalog = [
    template('community', { ownerType: 'user' }),
    template('mine-personal', { userId: 'user-1', ownerType: 'user' }),
    template('mine-in-org', { userId: 'user-1', ownerType: 'team' }),
    template('other-org', { ownerType: 'team' }),
    template('repo:library', { userId: 'repo-template-catalog' }),
    template('private', { isPublic: false }),
  ];
  const ids = (templates: ChecklistTemplate[]) => templates.map((entry) => entry.id);

  it('in Personal, leaves out the user\'s own Personal templates, which the server already exported', () => {
    expect(ids(selectPublicTemplatesForExport(catalog, { userId: 'user-1' })))
      .toEqual(['community', 'mine-in-org', 'other-org']);
  });

  it('in an Organization, leaves out that Organization\'s templates and keeps the user\'s public Personal ones', () => {
    expect(ids(selectPublicTemplatesForExport(catalog, { userId: 'user-1', teamId: 'org-1', ownedTemplateIds: ['mine-in-org'] })))
      .toEqual(['community', 'mine-personal', 'other-org']);
  });

  it('still recognises Organization templates by team id when a row has one', () => {
    const withTeamIds = [template('mine-in-org', { teamId: 'org-1' }), template('other-org', { teamId: 'org-2' })];

    expect(ids(selectPublicTemplatesForExport(withTeamIds, { userId: 'user-1', teamId: 'org-1' }))).toEqual(['other-org']);
    expect(ids(selectPublicTemplatesForExport(withTeamIds, { userId: 'user-1' }))).toEqual(['mine-in-org', 'other-org']);
  });

  it('never adds the bundled library or a private template', () => {
    const selected = ids(selectPublicTemplatesForExport(catalog, { userId: 'someone-else' }));
    expect(selected).not.toContain('repo:library');
    expect(selected).not.toContain('private');
  });

  it('appends the public templates to the owned pack with one manifest for both', () => {
    const ownedPack = JSON.parse(JSON.stringify(buildPortableTemplatePack([{
      id: 'owned',
      title: 'Owned',
      description: '',
      type: 'checklist',
      seoTitle: '',
      seoDescription: '',
      sections: [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', contents: [{ id: 'c1', type: 'image', value: '/api/uploads/file?key=a' }] }] }],
      categories: [],
      tags: [],
      isPublic: false,
      slug: 'owned',
    }], 'me@example.com')));
    const withRules = template('ruled', {
      rules: [{ id: 'rule-1', type: 'required-field', path: 'title', severity: 'error' }],
      sections: [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', contents: [{ id: 'c1', type: 'file', value: '/api/uploads/file?key=b', uploadType: 'upload' }] }] }],
    });
    const empty = template('empty', { sections: [] });

    const pack = addPublicTemplatesToPack(ownedPack, [template('community'), withRules, empty]);

    expect(portableTemplatePackSchema.safeParse(pack).success).toBe(true);
    expect(pack.exportedBy).toBe('me@example.com');
    expect(pack.templates.map((entry) => entry.title)).toEqual(['Owned', 'Template community', 'Template ruled']);
    expect(pack.manifest).toEqual({
      totalTemplates: 3,
      format: 'portable',
      includesVisibility: true,
      includesRules: true,
      assetWarnings: 2,
      skippedTemplates: [{ title: 'Template empty', reason: 'Template has no sections with tasks' }],
    });
  });

  it('returns the owned pack unchanged when there is nothing to add, and rejects a response that is not a pack', () => {
    const ownedPack = JSON.parse(JSON.stringify(buildPortableTemplatePack([], undefined)));

    expect(addPublicTemplatesToPack(ownedPack, [])).toEqual(ownedPack);
    expect(() => addPublicTemplatesToPack({ templates: 'nope' }, [template('community')])).toThrow();
  });
});
