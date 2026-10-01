import { describe, expect, it, vi } from 'vitest';
import {
  PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  type ChecklistTemplate,
} from '@/lib/schemas/checklistSchema';
import {
  downloadBackupFile,
  exportPortableTemplatesToJSON,
  parseTemplatesFromJSON,
} from '@/lib/utils/templateBackup';

const createTemplate = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Portable Template',
  description: 'Desc',
  type: 'checklist',
  sections: [
    {
      id: 'section-1',
      title: 'Prep',
      items: [
        {
          id: 'item-1',
          title: 'Review content',
          contents: [{ id: 'content-1', type: 'text', value: 'Check analytics.' }],
        },
      ],
    },
  ],
  userId: 'user-1',
  createdAt: '2026-03-21T00:00:00.000Z',
  updatedAt: '2026-03-21T00:00:00.000Z',
  isPublic: false,
  slug: 'portable-template',
  seoTitle: 'Portable SEO Title',
  seoDescription: 'Portable SEO Description',
  categories: ['seo'],
  tags: ['content'],
  rules: [
    {
      id: 'rule-1',
      type: 'required-field',
      path: 'sections[].items[].title',
      value: 'Every item needs a title',
      severity: 'error',
    },
  ],
  version: 1,
  ...overrides,
});

describe('portable template utilities', () => {
  it('exports a portable template pack', () => {
    const result = exportPortableTemplatesToJSON([createTemplate()], 'john@test.com');

    expect(result.kind).toBe('serplists-template-pack');
    expect(result.schemaVersion).toBe(PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION);
    expect(result.templates[0]).not.toHaveProperty('userId');
    expect(result.templates[0].visibility).toBe('private');
    expect(result.templates[0].seoTitle).toBe('Portable SEO Title');
    expect(result.templates[0].seoDescription).toBe('Portable SEO Description');
    expect(result.templates[0].rules).toHaveLength(1);
    expect(result.manifest?.includesRules).toBe(true);
  });

  it('parses a portable template pack into normalized templates', async () => {
    const portablePack = {
      kind: 'serplists-template-pack',
      schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
      exportedAt: '2026-03-21T00:00:00.000Z',
      templates: [
        {
          title: 'Imported Portable Template',
          visibility: 'public',
          seoTitle: 'Imported SEO Title',
          seoDescription: 'Imported SEO Description',
          categories: ['seo'],
          tags: ['content'],
          rules: [
            {
              id: 'rule-1',
              type: 'required-field',
              path: 'sections[].items[].title',
              value: 'Every item needs a title',
              severity: 'error',
            },
          ],
          sections: [
            {
              title: 'Prep',
              items: [
                {
                  title: 'Review content',
                  contents: [{ type: 'text', value: 'Check analytics.' }],
                },
              ],
            },
          ],
        },
      ],
    };

    const file = new File([JSON.stringify(portablePack)], 'portable.json', { type: 'application/json' });
    const result = await parseTemplatesFromJSON(file);

    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].title).toBe('Imported Portable Template');
    expect(result.templates[0].isPublic).toBe(true);
    expect(result.templates[0].seoTitle).toBe('Imported SEO Title');
    expect(result.templates[0].seoDescription).toBe('Imported SEO Description');
    expect(result.templates[0].rules).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it('rejects unsupported portable schema versions', async () => {
    const portablePack = {
      kind: 'serplists-template-pack',
      schemaVersion: '9.9.9',
      exportedAt: '2026-03-21T00:00:00.000Z',
      templates: [
        {
          title: 'Imported Portable Template',
          sections: [
            {
              title: 'Prep',
              items: [{ title: 'Review content' }],
            },
          ],
        },
      ],
    };

    const file = new File([JSON.stringify(portablePack)], 'portable.json', { type: 'application/json' });
    await expect(parseTemplatesFromJSON(file)).rejects.toThrow('Unsupported portable template schema version');
  });

  it('uses a portable default filename for portable template packs', () => {
    const click = vi.fn();
    const link = {
      href: '',
      download: '',
      click,
    };
    const createObjectURL = vi.fn(() => 'blob:portable-pack');
    const revokeObjectURL = vi.fn();

    try {
      vi.stubGlobal('document', {
        createElement: vi.fn(() => link),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
      });
      vi.stubGlobal('URL', {
        createObjectURL,
        revokeObjectURL,
      });

      const portablePack = exportPortableTemplatesToJSON([createTemplate()], 'john@test.com');
      downloadBackupFile(portablePack as never);

      expect(link.download).toMatch(/^serplists-template-pack-\d{4}-\d{2}-\d{2}\.json$/);
      expect(click).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
