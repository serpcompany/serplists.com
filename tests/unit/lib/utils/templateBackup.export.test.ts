import { describe, it, expect } from 'vitest';
import { exportTemplatesToJSON, parseTemplatesFromJSON, prepareTemplatesForImport } from '@/lib/utils/templateBackup';
import { createMockTemplate } from '../../../fixtures/templateBackupFixtures';
import { jsonFile } from '../../../fixtures/jsonFile';

describe('Template Backup Utilities', () => {
  describe('exportTemplatesToJSON', () => {
    it('should export templates with metadata', () => {
      const templates = [
        createMockTemplate({ isPublic: true }),
        createMockTemplate({ id: 'template-2', isPublic: false }),
        createMockTemplate({ id: 'template-3', isPublic: true })
      ];
      
      const backup = exportTemplatesToJSON(templates, 'test@example.com');
      
      expect(backup.version).toBe('1.0.0');
      expect(backup.exportedBy).toBe('test@example.com');
      expect(backup.templates).toHaveLength(3);
      expect(backup.metadata?.totalTemplates).toBe(3);
      expect(backup.metadata?.publicTemplates).toBe(2);
      expect(backup.metadata?.privateTemplates).toBe(1);
    });

    it('should handle empty template array', () => {
      const backup = exportTemplatesToJSON([]);
      
      expect(backup.templates).toHaveLength(0);
      expect(backup.metadata?.totalTemplates).toBe(0);
    });

    it('should include ISO timestamp', () => {
      const backup = exportTemplatesToJSON([createMockTemplate()]);
      
      expect(backup.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Import/Export Round Trip', () => {
    it('should maintain data integrity through export and import', async () => {
      const originalTemplates = [
        createMockTemplate({
          title: 'Complex Template',
          sections: [
            {
              id: 'section-1',
              title: 'Section 1',
              items: [
                {
                  id: 'item-1',
                  title: 'Item with various content',
                  contents: [
                    { id: 'c1', type: 'text', value: 'Text content' },
                    { id: 'c2', type: 'image', value: 'image.jpg' },
                    { id: 'c3', type: 'video', value: 'video.mp4' },
                    {
                      id: 'c4',
                      type: 'subItems',
                      value: '',
                      subItems: [
                        { id: 's1', title: 'Subtask 1' },
                        { id: 's2', title: 'Subtask 2' }
                      ]
                    }
                  ]
                }
              ]
            }
          ],
          categories: ['cat1', 'cat2'],
          tags: ['tag1', 'tag2', 'tag3']
        })
      ];
      
      const backup = exportTemplatesToJSON(originalTemplates, 'test@example.com');
      const backupFile = jsonFile(backup, 'backup.json');

      const importedTemplates = await parseTemplatesFromJSON(backupFile);
      const preparedTemplates = prepareTemplatesForImport(importedTemplates.templates, 'new-user');

      expect(preparedTemplates[0].title).toBe('Complex Template');
      expect(preparedTemplates[0].sections).toHaveLength(1);
      expect(preparedTemplates[0].sections[0].items[0].contents).toHaveLength(4);
      expect(preparedTemplates[0].categories).toEqual(['cat1', 'cat2']);
      expect(preparedTemplates[0].tags).toEqual(['tag1', 'tag2', 'tag3']);

      const subItems = preparedTemplates[0].sections[0].items[0].contents?.[3].subItems;
      expect(subItems).toHaveLength(2);
      expect(subItems?.[0].title).toBe('Subtask 1');
    });
  });
});
