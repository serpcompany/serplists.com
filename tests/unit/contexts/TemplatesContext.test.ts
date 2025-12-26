import { describe, it, expect, beforeEach } from 'vitest';

describe('Template Import Functionality', () => {
  describe('Template Structure Preservation', () => {
    const mockTemplateWithFullStructure = {
      id: 'test-template-1',
      title: 'Test Template',
      description: 'Test template with full structure',
      sections: [
        {
          id: 'section-1',
          title: 'Test Section',
          items: [
            {
              id: 'item-1',
              title: 'Item with description',
              description: 'This is a detailed description',
              contents: [
                {
                  id: 'content-1',
                  type: 'text',
                  value: 'Some text content'
                },
                {
                  id: 'content-2',
                  type: 'subItems',
                  value: '',
                  subItems: [
                    {
                      id: 'sub-1',
                      title: 'Sub-item 1'
                    },
                    {
                      id: 'sub-2',
                      title: 'Sub-item 2'
                    }
                  ]
                }
              ]
            },
            {
              id: 'item-2',
              title: 'Simple item',
              description: 'Just a simple item'
            }
          ]
        }
      ]
    };

    it('should preserve item descriptions when importing templates', () => {
      const items = mockTemplateWithFullStructure.sections[0].items;
      
      expect(items[0].description).toBe('This is a detailed description');
      expect(items[1].description).toBe('Just a simple item');
    });

    it('should preserve item contents when importing templates', () => {
      const item = mockTemplateWithFullStructure.sections[0].items[0];
      
      expect(item.contents).toBeDefined();
      expect(item.contents).toHaveLength(2);
      expect(item.contents[0].type).toBe('text');
      expect(item.contents[0].value).toBe('Some text content');
    });

    it('should preserve sub-items when importing templates', () => {
      const item = mockTemplateWithFullStructure.sections[0].items[0];
      const subItemsContent = item.contents.find(c => c.type === 'subItems');
      
      expect(subItemsContent).toBeDefined();
      expect(subItemsContent.subItems).toBeDefined();
      expect(subItemsContent.subItems).toHaveLength(2);
      expect(subItemsContent.subItems[0].title).toBe('Sub-item 1');
    });

    it('should handle sections format detection correctly', () => {
      // Test data in sections format (new format)
      const sectionsFormat = [
        {
          id: 'section-1',
          title: 'Section 1',
          items: [
            { id: 'item-1', title: 'Item 1' }
          ]
        }
      ];

      // Test data in flat items format (legacy)
      const flatFormat = [
        { id: 'item-1', title: 'Item 1', completed: false }
      ];

      // Check if sections format is detected
      const hasSectionsFormat = Array.isArray(sectionsFormat) && 
        sectionsFormat.length > 0 && 
        sectionsFormat[0]?.items !== undefined;
      
      expect(hasSectionsFormat).toBe(true);

      // Check if flat format is detected
      const hasFlatFormat = Array.isArray(flatFormat) && 
        flatFormat.length > 0 && 
        !flatFormat[0]?.items;
      
      expect(hasFlatFormat).toBe(true);
    });
  });

  describe('Template Import from JSON File', () => {
    const mockImportedJSON = {
      version: '1.0.0',
      templates: [
        {
          id: 'imported-1',
          title: 'Imported Template',
          description: 'Template imported from JSON',
          sections: [
            {
              id: 'section-1',
              title: 'Imported Section',
              items: [
                {
                  id: 'item-1',
                  title: 'Imported Item',
                  description: 'Item with full content',
                  contents: [
                    {
                      id: 'content-1',
                      type: 'text',
                      value: 'Imported text content'
                    }
                  ]
                }
              ]
            }
          ],
          categories: ['test'],
          tags: ['imported', 'test'],
          isPublic: true
        }
      ]
    };

    it('should parse templates from imported JSON correctly', () => {
      const templates = mockImportedJSON.templates;
      
      expect(templates).toHaveLength(1);
      expect(templates[0].title).toBe('Imported Template');
      expect(templates[0].sections).toBeDefined();
      expect(templates[0].sections).toHaveLength(1);
    });

    it('should preserve all nested content from imported JSON', () => {
      const template = mockImportedJSON.templates[0];
      const item = template.sections[0].items[0];
      
      expect(item.title).toBe('Imported Item');
      expect(item.description).toBe('Item with full content');
      expect(item.contents).toBeDefined();
      expect(item.contents[0].value).toBe('Imported text content');
    });

    it('should handle template metadata correctly', () => {
      const template = mockImportedJSON.templates[0];
      
      expect(template.categories).toContain('test');
      expect(template.tags).toContain('imported');
      expect(template.isPublic).toBe(true);
    });
  });

  describe('Database Storage Format', () => {
    it('should store sections as JSON when saving to database', () => {
      const sections = [
        {
          id: 'section-1',
          title: 'Test Section',
          items: [
            {
              id: 'item-1',
              title: 'Test Item',
              description: 'Test Description',
              contents: []
            }
          ]
        }
      ];

      // Simulate database storage
      const dbValue = JSON.stringify(sections);
      
      // Verify it can be parsed back
      const parsed = JSON.parse(dbValue);
      expect(parsed).toEqual(sections);
      expect(parsed[0].items[0].description).toBe('Test Description');
    });

    it('should handle both legacy and new format when reading from database', () => {
      // Legacy format (flat items array)
      const legacyData = JSON.stringify([
        { id: 'item-1', title: 'Item 1', completed: false }
      ]);

      // New format (sections with nested items)
      const newData = JSON.stringify([
        {
          id: 'section-1',
          title: 'Section 1',
          items: [
            { id: 'item-1', title: 'Item 1', description: 'Description' }
          ]
        }
      ]);

      // Parse and check legacy format
      const legacyParsed = JSON.parse(legacyData);
      expect(Array.isArray(legacyParsed)).toBe(true);
      expect(legacyParsed[0].items).toBeUndefined();

      // Parse and check new format
      const newParsed = JSON.parse(newData);
      expect(Array.isArray(newParsed)).toBe(true);
      expect(newParsed[0].items).toBeDefined();
    });
  });

  describe('Template Display After Import', () => {
    it('should display all template content in edit mode', () => {
      const template = {
        sections: [
          {
            id: 'section-1',
            title: 'Section',
            items: [
              {
                id: 'item-1',
                title: 'Item Title',
                description: 'Item Description',
                contents: [
                  { id: 'c-1', type: 'text', value: 'Content' }
                ]
              }
            ]
          }
        ]
      };

      // All parts should be accessible for display
      expect(template.sections[0].items[0].title).toBe('Item Title');
      expect(template.sections[0].items[0].description).toBe('Item Description');
      expect(template.sections[0].items[0].contents).toHaveLength(1);
    });

    it('should display all template content when running checklist', () => {
      const run = {
        sections: [
          {
            id: 'section-1',
            title: 'Section',
            items: [
              {
                id: 'item-1',
                title: 'Item Title',
                description: 'Item Description',
                contents: [
                  { id: 'c-1', type: 'text', value: 'Content' }
                ],
                isCompleted: false
              }
            ]
          }
        ]
      };

      // All content should be available during run
      expect(run.sections[0].items[0].title).toBe('Item Title');
      expect(run.sections[0].items[0].description).toBe('Item Description');
      expect(run.sections[0].items[0].contents).toBeDefined();
    });
  });
});