import { expectThePortableSeoFieldsAndOneRule } from '../../../support/portableTemplateChecks';
import { describe, it, expect } from 'vitest';
import { contentAt, elementAt, firstOf } from '../../../support/elements';
import { parseBackupFile, parseTemplatesFromData, parseTemplatesFromJSON } from '@/lib/utils/templateBackup';
import { TemplateBackup } from '@/lib/schemas/checklistSchema';
import { createMockTemplate } from '../../../fixtures/templateBackupFixtures';
import { jsonFile, TITLE_REQUIRED_RULE } from '../../../fixtures/jsonFile';

describe('Template Backup Utilities', () => {
  describe('parseBackupFile', () => {
    it('should parse valid backup file', async () => {
      const validBackup: TemplateBackup = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00Z',
        templates: [createMockTemplate()]
      };
      
      const file = jsonFile(validBackup, 'backup.json');
      
      const result = await parseBackupFile(file);
      
      expect(result.version).toBe('1.0.0');
      expect(result.templates).toHaveLength(1);
    });

    it('should reject invalid JSON', async () => {
      const file = new File(['invalid json'], 'backup.json', {
        type: 'application/json'
      });
      
      await expect(parseBackupFile(file)).rejects.toThrow('Invalid JSON file format');
    });

    it('should reject invalid backup structure', async () => {
      const invalidBackup = {
        templates: 'not an array'
      };
      
      const file = jsonFile(invalidBackup, 'backup.json');
      
      await expect(parseBackupFile(file)).rejects.toThrow('Backup validation failed');
    });
  });

  describe('parseTemplatesFromJSON', () => {
    it('should parse backup format', async () => {
      const backup: TemplateBackup = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00Z',
        templates: [createMockTemplate()]
      };
      
      const file = jsonFile(backup, 'backup.json');
      
      const result = await parseTemplatesFromJSON(file);
      
      expect(result.templates).toHaveLength(1);
      expect(firstOf(result.templates).title).toBe('Test Template');
    });

    it('should parse simple array format', async () => {
      const templates = [
        createMockTemplate(),
        createMockTemplate({ id: 'template-2', title: 'Second Template' })
      ];
      
      const file = jsonFile(templates, 'templates.json');
      
      const result = await parseTemplatesFromJSON(file);
      
      expect(result.templates).toHaveLength(2);
      expect(elementAt(result.templates, 1).title).toBe('Second Template');
    });

    it('should preserve seo metadata and rules from portable imports', async () => {
      const portablePack = {
        kind: 'serplists-template-pack',
        schemaVersion: '2.0.0',
        exportedAt: '2026-03-24T00:00:00.000Z',
        templates: [
          {
            title: 'Portable Template',
            seoTitle: 'Portable SEO Title',
            seoDescription: 'Portable SEO Description',
            visibility: 'private',
            rules: [TITLE_REQUIRED_RULE],
            sections: [
              {
                title: 'Checklist',
                items: [{ title: 'Item' }],
              },
            ],
          },
        ],
      };

      const file = jsonFile(portablePack, 'portable.json');

      const result = await parseTemplatesFromJSON(file);

      expectThePortableSeoFieldsAndOneRule(firstOf(result.templates));
    });

    it('should surface warnings for uploaded assets', async () => {
      const templates = [
        createMockTemplate({
          sections: [
            {
              id: 'section-1',
              title: 'Assets',
              items: [
                {
                  id: 'item-1',
                  title: 'Image',
                  contents: [
                    {
                      id: 'content-1',
                      type: 'image',
                      value: '/api/uploads/file?key=template-images/user/file.png',
                      uploadType: 'upload'
                    }
                  ]
                }
              ]
            }
          ]
        })
      ];

      const file = jsonFile(templates, 'templates.json');

      const result = await parseTemplatesFromJSON(file);

      expect(result.warnings).toHaveLength(1);
      expect(firstOf(result.warnings).message).toMatch(/uploaded asset/i);
    });


    it('should reject malformed JSON', async () => {
      const file = new File(['not json'], 'bad.json', {
        type: 'application/json'
      });
      
      await expect(parseTemplatesFromJSON(file)).rejects.toThrow('Invalid JSON file format');
    });

    it('should reject invalid template structure', async () => {
      const invalidTemplate = {
        notATemplate: true
      };
      
      const file = new File([JSON.stringify([invalidTemplate])], 'invalid.json', {
        type: 'application/json'
      });
      
      await expect(parseTemplatesFromJSON(file)).rejects.toThrow(
        'Template validation failed: Template 1 > title: Required',
      );
    });
  });

  describe('parseTemplatesFromData with tasks written as text', () => {
    const itemsOf = (result: ReturnType<typeof parseTemplatesFromData>) =>
      result.templates.flatMap((template) => template.sections.flatMap((section) => section.items));
    const expectCleanItems = (result: ReturnType<typeof parseTemplatesFromData>) => {
      for (const item of itemsOf(result)) {
        expect(item.title.trim()).not.toBe('');
        expect(Object.keys(item).filter((key) => /^\d+$/.test(key))).toEqual([]);
      }
    };

    it('imports text tasks in sections as titled tasks', () => {
      const result = parseTemplatesFromData([
        { title: 'Groceries', sections: [{ title: 'Shop', items: ['Milk', ' Eggs '] }] },
      ]);

      expect(itemsOf(result).map((item) => item.title)).toEqual(['Milk', 'Eggs']);
      expectCleanItems(result);
    });

    it('imports the flat items form and a stringified array the same way', () => {
      const flat = parseTemplatesFromData([{ title: 'Groceries', items: ['Milk', { title: 'Eggs' }] }]);
      expect(firstOf(flat.templates).sections.map((section) => section.title)).toEqual(['Checklist']);
      expect(itemsOf(flat).map((item) => item.title)).toEqual(['Milk', 'Eggs']);
      expectCleanItems(flat);

      const stringified = parseTemplatesFromData([{ title: 'Groceries', items: JSON.stringify(['Milk']) }]);
      expect(itemsOf(stringified).map((item) => item.title)).toEqual(['Milk']);
      expectCleanItems(stringified);
    });

    it('imports text sub-tasks as titled sub-tasks', () => {
      const result = parseTemplatesFromData({
        templates: [
          {
            title: 'Groceries',
            sections: [
              {
                title: 'Shop',
                items: [{ title: 'Dairy', contents: [{ type: 'subItems', value: '', subItems: ['Milk', 'Cheese'] }] }],
              },
            ],
          },
        ],
      });

      const subItems = contentAt(firstOf(itemsOf(result)), 0).subItems ?? [];
      expect(subItems.map((subItem) => subItem.title)).toEqual(['Milk', 'Cheese']);
      for (const subItem of subItems) {
        expect(Object.keys(subItem).filter((key) => /^\d+$/.test(key))).toEqual([]);
      }
    });

    it.each([
      ['a null task', [{ title: 'Groceries', sections: [{ title: 'Shop', items: ['Milk', null] }] }], /task 2 in section "Shop"/],
      ['a number task', [{ title: 'Groceries', items: [5] }], /task 1 in section "Checklist"/],
      ['a nested array task', [{ title: 'Groceries', items: [['Milk']] }], /task 1 in section "Checklist"/],
      ['an empty text task', [{ title: 'Groceries', items: ['Milk', '  '] }], /task 2 in section "Checklist" is empty/],
      ['a section that is not an object', [{ title: 'Groceries', sections: [{ title: 'Shop', items: [] }, 'Bakery'] }], /section 2/],
      [
        'a sub-task that is not text or an object',
        [{ title: 'Groceries', items: [{ title: 'Dairy', contents: [{ type: 'subItems', value: '', subItems: [3] }] }] }],
        /sub-task 1 of task "Dairy"/,
      ],
      [
        'a content block that is not an object',
        [{ title: 'Groceries', items: [{ title: 'Dairy', contents: ['note'] }] }],
        /content block 1 of task "Dairy"/,
      ],
    ])('rejects %s with a message that names the template and the entry', (_label, data, message) => {
      expect(() => parseTemplatesFromData(data)).toThrow(/Template validation failed: Template "Groceries": /);
      expect(() => parseTemplatesFromData(data)).toThrow(message);
    });
  });
});
