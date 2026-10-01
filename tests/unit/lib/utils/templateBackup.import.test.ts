import { describe, it, expect } from 'vitest';
import { contentAt, firstOf, sectionAt, subTaskAt, taskAt } from '../../../support/elements';
import {
  exportTemplatesToJSON,
  generateUniqueIds,
  prepareTemplatesForImport,
  countImportPublicTemplates,
  resolveImportIsPublic,
} from '@/lib/utils/templateBackup';
import { createMockTemplate } from '../../../fixtures/templateBackupFixtures';

describe('Template Backup Utilities', () => {
  describe('generateUniqueIds', () => {
    it('should generate new IDs for all entities', () => {
      const templates = [createMockTemplate()];
      
      const result = generateUniqueIds(templates);
      
      expect(firstOf(result).id).not.toBe('template-1');
      expect(firstOf(result).id).toMatch(/^imported_\d+_[a-z0-9]+$/);
      expect(sectionAt(firstOf(result), 0).id).not.toBe('section-1');
      expect(taskAt(firstOf(result), 0, 0).id).not.toBe('item-1');
    });

    it('should update timestamps', () => {
      const oldTemplate = createMockTemplate({
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z'
      });
      
      const result = generateUniqueIds([oldTemplate]);
      
      expect(new Date(firstOf(result).createdAt).getFullYear()).toBeGreaterThan(2020);
      expect(new Date(firstOf(result).updatedAt).getFullYear()).toBeGreaterThan(2020);
    });

    it('should clear slug for regeneration', () => {
      const template = createMockTemplate({ slug: 'existing-slug' });
      
      const result = generateUniqueIds([template]);
      
      expect(firstOf(result).slug).toBe('');
    });

    it('should handle nested subItems', () => {
      const template = createMockTemplate({
        sections: [
          {
            id: 'section-1',
            title: 'Section',
            items: [
              {
                id: 'item-1',
                title: 'Item',
                contents: [
                  {
                    id: 'content-1',
                    type: 'subItems',
                    value: '',
                    subItems: [
                      { id: 'sub-1', title: 'Subtask 1' },
                      { id: 'sub-2', title: 'Subtask 2' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
      
      const result = generateUniqueIds([template]);
      const firstSubTask = subTaskAt(contentAt(taskAt(firstOf(result), 0, 0), 0), 0);
      
      expect(firstSubTask.id).not.toBe('sub-1');
      expect(firstSubTask.id).toMatch(/^subitem_\d+_[a-z0-9]+$/);
    });

    it('should preserve content values', () => {
      const template = createMockTemplate();
      const result = generateUniqueIds([template]);
      
      expect(firstOf(result).title).toBe('Test Template');
      expect(contentAt(taskAt(firstOf(result), 0, 0), 0).value).toBe('Test content');
    });
  });

  describe('prepareTemplatesForImport', () => {
    it('should assign new user ID', () => {
      const templates = [createMockTemplate({ userId: 'old-user' })];
      
      const result = prepareTemplatesForImport(templates, 'new-user-123');
      
      expect(firstOf(result).userId).toBe('new-user-123');
    });

    it('should set public status', () => {
      const templates = [
        createMockTemplate({ isPublic: false }),
        createMockTemplate({ id: 'template-2', isPublic: true })
      ];
      
      const result = prepareTemplatesForImport(templates, 'user-123', { visibility: 'public' });
      
      expect(result.every(t => t.isPublic)).toBe(true);
    });

    it('should respect visibility override', () => {
      const templates = [createMockTemplate({ isPublic: true })];
      
      const result = prepareTemplatesForImport(templates, 'user-123', { visibility: 'private' });
      
      expect(firstOf(result).isPublic).toBe(false);
    });

    it('should reset completion states', () => {
      const template = createMockTemplate({
        sections: [
          {
            id: 'section-1',
            title: 'Section',
            items: [
              {
                id: 'item-1',
                title: 'Item',
                isCompleted: true,
                contents: [
                  {
                    id: 'content-1',
                    type: 'subItems',
                    value: '',
                    subItems: [
                      { id: 'sub-1', title: 'Subtask', isCompleted: true }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
      
      const result = prepareTemplatesForImport([template], 'user-123');
      
      expect(taskAt(firstOf(result), 0, 0).isCompleted).toBe(false);
      expect(subTaskAt(contentAt(taskAt(firstOf(result), 0, 0), 0), 0).isCompleted).toBe(false);
    });

    it('should generate unique IDs', () => {
      const templates = [createMockTemplate()];
      
      const result = prepareTemplatesForImport(templates, 'user-123');
      
      expect(firstOf(result).id).not.toBe('template-1');
      expect(firstOf(result).id).toMatch(/^imported_\d+_[a-z0-9]+$/);
    });

    it('should handle multiple templates', () => {
      const templates = [
        createMockTemplate(),
        createMockTemplate({ id: 'template-2' }),
        createMockTemplate({ id: 'template-3' })
      ];

      const result = prepareTemplatesForImport(templates, 'user-123');

      expect(result).toHaveLength(3);
      const uniqueIds = new Set(result.map(t => t.id));
      expect(uniqueIds.size).toBe(3);
      expect(result.every(t => t.userId === 'user-123')).toBe(true);
    });

    it('should preserve seo metadata and rules while preparing templates for import', () => {
      const templates = [
        createMockTemplate({
          seoTitle: 'SEO Title',
          seoDescription: 'SEO Description',
          rules: [
            {
              id: 'rule-1',
              type: 'required-field',
              path: 'sections[].items[].title',
              value: 'Every item needs a title',
              severity: 'error',
            },
          ],
        }),
      ];

      const result = prepareTemplatesForImport(templates, 'user-123');

      expect(firstOf(result).seoTitle).toBe('SEO Title');
      expect(firstOf(result).seoDescription).toBe('SEO Description');
      expect(firstOf(result).rules).toHaveLength(1);
    });
  });

  describe('import visibility', () => {
    const visibilities = ['preserve', 'public', 'private'] as const;

    it.each([
      [true, 'preserve', true],
      [false, 'preserve', false],
      [undefined, 'preserve', false],
      [true, 'public', true],
      [false, 'public', true],
      [undefined, 'public', true],
      [true, 'private', false],
      [false, 'private', false],
      [undefined, 'private', false],
    ] as const)('isPublic %s with %s visibility is public: %s', (isPublic, visibility, expected) => {
      expect(resolveImportIsPublic(isPublic, visibility)).toBe(expected);
    });

    it('counts the public templates the import will create for each visibility', () => {
      const templates = [
        createMockTemplate({ id: 'a', isPublic: true }),
        createMockTemplate({ id: 'b', isPublic: true }),
        createMockTemplate({ id: 'c', isPublic: false }),
      ];

      expect(countImportPublicTemplates(templates, 'preserve')).toBe(2);
      expect(countImportPublicTemplates(templates, 'public')).toBe(3);
      expect(countImportPublicTemplates(templates, 'private')).toBe(0);
      expect(countImportPublicTemplates([], 'public')).toBe(0);

      for (const visibility of visibilities) {
        const prepared = prepareTemplatesForImport(templates, 'user-1', { visibility });
        expect(prepared.filter((template) => template.isPublic)).toHaveLength(
          countImportPublicTemplates(templates, visibility),
        );
      }
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle templates with empty sections', () => {
      const template = createMockTemplate({ sections: [] });
      const result = generateUniqueIds([template]);
      
      expect(firstOf(result).sections).toEqual([]);
    });

    it('should handle items without contents', () => {
      const template = createMockTemplate({
        sections: [
          {
            id: 'section-1',
            title: 'Section',
            items: [
              {
                id: 'item-1',
                title: 'Item without contents'
              }
            ]
          }
        ]
      });
      
      const result = generateUniqueIds([template]);
      expect(taskAt(firstOf(result), 0, 0).contents).toBeUndefined();
    });

    it('should handle very large template collections', () => {
      const largeCollection = Array(100).fill(null).map((_, i) => 
        createMockTemplate({ id: `template-${i}` })
      );
      
      const backup = exportTemplatesToJSON(largeCollection);
      expect(backup.templates).toHaveLength(100);
      expect(backup.metadata?.totalTemplates).toBe(100);
    });

    it('should handle special characters in template data', () => {
      const template = createMockTemplate({
        title: 'Template with "quotes" and \'apostrophes\'',
        description: 'Line 1\nLine 2\tTabbed',
        sections: [
          {
            id: 'section-1',
            title: 'Section & <special>',
            items: [
              {
                id: 'item-1',
                title: 'Item with 特殊文字',
                contents: [
                  {
                    id: 'c1',
                    type: 'text',
                    value: '<script>alert("xss")</script>'
                  }
                ]
              }
            ]
          }
        ]
      });
      
      const result = generateUniqueIds([template]);
      expect(firstOf(result).title).toBe('Template with "quotes" and \'apostrophes\'');
      expect(contentAt(taskAt(firstOf(result), 0, 0), 0).value).toBe('<script>alert("xss")</script>');
    });
  });
});
