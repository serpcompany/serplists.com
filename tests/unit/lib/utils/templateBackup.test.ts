import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportTemplatesToJSON,
  parseBackupFile,
  parseTemplatesFromData,
  parseTemplatesFromFile,
  parseTemplatesFromJSON,
  generateUniqueIds,
  prepareTemplatesForImport
} from '@/lib/utils/templateBackup';
import { ChecklistTemplate, TemplateBackup } from '@/lib/schemas/checklistSchema';
import { renderTemplateMarkdown } from '@/lib/templates/templateMarkdown';

// Mock DOM methods
const mockCreateElement = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockClick = vi.fn();
const mockRevokeObjectURL = vi.fn();

describe('Template Backup Utilities', () => {
  beforeEach(() => {
    // Setup DOM mocks using jsdom globals
    if (typeof document !== 'undefined') {
      vi.spyOn(document, 'createElement').mockImplementation(() => {
        const element = {
          click: mockClick,
          href: '',
          download: '',
          appendChild: vi.fn(),
          removeChild: vi.fn()
        } as any;
        return element;
      });
      
      vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
      vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);
    }
    
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mockRevokeObjectURL);
    
    
    mockCreateElement.mockReturnValue({
      click: mockClick,
      href: '',
      download: ''
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockTemplate = (overrides = {}): ChecklistTemplate => ({
    id: 'template-1',
    title: 'Test Template',
    description: 'Test description',
    sections: [
      {
        id: 'section-1',
        title: 'Test Section',
        items: [
          {
            id: 'item-1',
            title: 'Test Item',
            description: 'Item description',
            contents: [
              {
                id: 'content-1',
                type: 'text',
                value: 'Test content'
              }
            ]
          }
        ]
      }
    ],
    userId: 'user-123',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    isPublic: true,
    slug: 'test-template',
    categories: ['test'],
    tags: ['sample'],
    ...overrides
  });

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


  describe('parseBackupFile', () => {
    it('should parse valid backup file', async () => {
      const validBackup: TemplateBackup = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00Z',
        templates: [createMockTemplate()]
      };
      
      const file = new File([JSON.stringify(validBackup)], 'backup.json', {
        type: 'application/json'
      });
      
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
      
      const file = new File([JSON.stringify(invalidBackup)], 'backup.json', {
        type: 'application/json'
      });
      
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
      
      const file = new File([JSON.stringify(backup)], 'backup.json', {
        type: 'application/json'
      });
      
      const result = await parseTemplatesFromJSON(file);
      
      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].title).toBe('Test Template');
    });

    it('should parse simple array format', async () => {
      const templates = [
        createMockTemplate(),
        createMockTemplate({ id: 'template-2', title: 'Second Template' })
      ];
      
      const file = new File([JSON.stringify(templates)], 'templates.json', {
        type: 'application/json'
      });
      
      const result = await parseTemplatesFromJSON(file);
      
      expect(result.templates).toHaveLength(2);
      expect(result.templates[1].title).toBe('Second Template');
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
                title: 'Checklist',
                items: [{ title: 'Item' }],
              },
            ],
          },
        ],
      };

      const file = new File([JSON.stringify(portablePack)], 'portable.json', {
        type: 'application/json'
      });

      const result = await parseTemplatesFromJSON(file);

      expect(result.templates[0].seoTitle).toBe('Portable SEO Title');
      expect(result.templates[0].seoDescription).toBe('Portable SEO Description');
      expect(result.templates[0].rules).toHaveLength(1);
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

      const file = new File([JSON.stringify(templates)], 'templates.json', {
        type: 'application/json'
      });

      const result = await parseTemplatesFromJSON(file);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toMatch(/uploaded asset/i);
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
      
      await expect(parseTemplatesFromJSON(file)).rejects.toThrow('Template validation failed');
    });
  });

  describe('parseTemplatesFromFile', () => {
    it('should parse strict markdown template files', async () => {
      const markdown = [
        '---',
        'title: Markdown Template',
        'visibility: public',
        'categories:',
        '  - ops',
        'tags:',
        '  - markdown',
        '---',
        '# Markdown Template',
        '',
        'Top-level description.',
        '',
        '## Prep',
        '',
        '### Review content',
        '',
        'Item description.',
        '',
        '```serplists:text',
        'This is **markdown** content.',
        '```',
        '',
        '```serplists:subItems',
        '- Step one',
        '- Step two',
        '```',
      ].join('\n');

      const file = new File([markdown], 'template.md', {
        type: 'text/markdown',
      });

      const result = await parseTemplatesFromFile(file);

      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].title).toBe('Markdown Template');
      expect(result.templates[0].isPublic).toBe(true);
      expect(result.templates[0].sections[0].items[0].contents).toHaveLength(2);
    });

    it('imports a Markdown file whose text block holds a heading and a code fence', async () => {
      const value = ['### Tips', 'Run:', '```bash', 'npm i', '```'].join('\n');
      const markdown = renderTemplateMarkdown({
        title: 'Setup Guide',
        sections: [
          {
            title: 'Install',
            items: [{ title: 'Run the installer', description: 'Do X', contents: [{ type: 'text', value }] }],
          },
        ],
      });

      const result = await parseTemplatesFromFile(
        new File([markdown], 'template.md', { type: 'text/markdown' }),
      );

      const item = result.templates[0].sections[0].items[0];
      expect(item.description).toBe('Do X');
      expect(item.contents?.map((content) => content.value)).toEqual([value]);
    });

    it('should parse single-template YAML files', async () => {
      const source = [
        'title: YAML Template',
        'visibility: private',
        'sections:',
        '  - title: Prep',
        '    items:',
        '      - title: Review content',
        '        description: Item description',
        '        contents:',
        '          - type: text',
        '            value: Plain text content',
      ].join('\n');

      const file = new File([source], 'template.yaml', {
        type: 'application/x-yaml',
      });

      const result = await parseTemplatesFromFile(file);

      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].title).toBe('YAML Template');
      expect(result.templates[0].isPublic).toBe(false);
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
      expect(flat.templates[0].sections.map((section) => section.title)).toEqual(['Checklist']);
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

      const subItems = itemsOf(result)[0].contents?.[0].subItems ?? [];
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

  describe('generateUniqueIds', () => {
    it('should generate new IDs for all entities', () => {
      const templates = [createMockTemplate()];
      
      const result = generateUniqueIds(templates);
      
      expect(result[0].id).not.toBe('template-1');
      expect(result[0].id).toMatch(/^imported_\d+_[a-z0-9]+$/);
      expect(result[0].sections[0].id).not.toBe('section-1');
      expect(result[0].sections[0].items[0].id).not.toBe('item-1');
    });

    it('should update timestamps', () => {
      const oldTemplate = createMockTemplate({
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z'
      });
      
      const result = generateUniqueIds([oldTemplate]);
      
      expect(new Date(result[0].createdAt).getFullYear()).toBeGreaterThan(2020);
      expect(new Date(result[0].updatedAt).getFullYear()).toBeGreaterThan(2020);
    });

    it('should clear slug for regeneration', () => {
      const template = createMockTemplate({ slug: 'existing-slug' });
      
      const result = generateUniqueIds([template]);
      
      expect(result[0].slug).toBe('');
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
      const subItems = result[0].sections[0].items[0].contents?.[0].subItems;
      
      expect(subItems?.[0].id).not.toBe('sub-1');
      expect(subItems?.[0].id).toMatch(/^subitem_\d+_[a-z0-9]+$/);
    });

    it('should preserve content values', () => {
      const template = createMockTemplate();
      const result = generateUniqueIds([template]);
      
      expect(result[0].title).toBe('Test Template');
      expect(result[0].sections[0].items[0].contents?.[0].value).toBe('Test content');
    });
  });

  describe('prepareTemplatesForImport', () => {
    it('should assign new user ID', () => {
      const templates = [createMockTemplate({ userId: 'old-user' })];
      
      const result = prepareTemplatesForImport(templates, 'new-user-123');
      
      expect(result[0].userId).toBe('new-user-123');
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
      
      expect(result[0].isPublic).toBe(false);
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
      
      expect(result[0].sections[0].items[0].isCompleted).toBe(false);
      expect(result[0].sections[0].items[0].contents?.[0].subItems?.[0].isCompleted).toBe(false);
    });

    it('should generate unique IDs', () => {
      const templates = [createMockTemplate()];
      
      const result = prepareTemplatesForImport(templates, 'user-123');
      
      expect(result[0].id).not.toBe('template-1');
      expect(result[0].id).toMatch(/^imported_\d+_[a-z0-9]+$/);
    });

    it('should handle multiple templates', () => {
      const templates = [
        createMockTemplate(),
        createMockTemplate({ id: 'template-2' }),
        createMockTemplate({ id: 'template-3' })
      ];
      
      const result = prepareTemplatesForImport(templates, 'user-123');
      
      expect(result).toHaveLength(3);
      expect(new Set(result.map(t => t.id)).size).toBe(3); // All IDs unique
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

      expect(result[0].seoTitle).toBe('SEO Title');
      expect(result[0].seoDescription).toBe('SEO Description');
      expect(result[0].rules).toHaveLength(1);
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
      
      // Export
      const backup = exportTemplatesToJSON(originalTemplates, 'test@example.com');
      
      // Simulate file
      const file = new File([JSON.stringify(backup)], 'backup.json', {
        type: 'application/json'
      });
      
      // Import
      const importedTemplates = await parseTemplatesFromJSON(file);
      const preparedTemplates = prepareTemplatesForImport(importedTemplates.templates, 'new-user');
      
      // Verify structure is maintained
      expect(preparedTemplates[0].title).toBe('Complex Template');
      expect(preparedTemplates[0].sections).toHaveLength(1);
      expect(preparedTemplates[0].sections[0].items[0].contents).toHaveLength(4);
      expect(preparedTemplates[0].categories).toEqual(['cat1', 'cat2']);
      expect(preparedTemplates[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
      
      // Verify subItems structure
      const subItems = preparedTemplates[0].sections[0].items[0].contents?.[3].subItems;
      expect(subItems).toHaveLength(2);
      expect(subItems?.[0].title).toBe('Subtask 1');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle templates with empty sections', () => {
      const template = createMockTemplate({ sections: [] });
      const result = generateUniqueIds([template]);
      
      expect(result[0].sections).toEqual([]);
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
      expect(result[0].sections[0].items[0].contents).toBeUndefined();
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
      expect(result[0].title).toBe('Template with "quotes" and \'apostrophes\'');
      expect(result[0].sections[0].items[0].contents?.[0].value).toBe('<script>alert("xss")</script>');
    });
  });
});
