import { describe, it, expect } from 'vitest';
import { contentAt, firstOf, subTaskAt, taskAt } from '../../../support/elements';
import { parseTemplatesFromFile, prepareTemplatesForImport } from '@/lib/utils/templateBackup';
import { createMockTemplate } from '../../../fixtures/templateBackupFixtures';
import { jsonFile } from '../../../fixtures/jsonFile';

describe('Template Backup Utilities', () => {
  describe('importing a backup file, the format the app exported before portable packs', () => {
    it('keeps the content, categories and tags of each Template', async () => {
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
      
      const backup = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        exportedBy: 'test@example.com',
        templates: originalTemplates,
        metadata: { totalTemplates: 1, publicTemplates: 1, privateTemplates: 0 },
      };
      const backupFile = jsonFile(backup, 'backup.json');

      const importedTemplates = await parseTemplatesFromFile(backupFile);
      const preparedTemplates = prepareTemplatesForImport(importedTemplates.templates, 'new-user');

      expect(firstOf(preparedTemplates).title).toBe('Complex Template');
      expect(firstOf(preparedTemplates).sections).toHaveLength(1);
      expect(taskAt(firstOf(preparedTemplates), 0, 0).contents).toHaveLength(4);
      expect(firstOf(preparedTemplates).categories).toEqual(['cat1', 'cat2']);
      expect(firstOf(preparedTemplates).tags).toEqual(['tag1', 'tag2', 'tag3']);

      const subTasks = contentAt(taskAt(firstOf(preparedTemplates), 0, 0), 3);
      expect(subTasks.subItems).toHaveLength(2);
      expect(subTaskAt(subTasks, 0).title).toBe('Subtask 1');
    });
  });
});
