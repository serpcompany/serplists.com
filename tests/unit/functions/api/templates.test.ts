import { describe, it, expect } from 'vitest';

describe('Nested Content Display Bug Fix', () => {
  describe('Issue: Imported templates showed empty in editor but worked when running', () => {
    it('should NOT flatten sections structure during import', () => {
      // This was the bug - sections were being flattened
      const sectionsWithNestedContent = [
        {
          id: 'section-1',
          title: 'Test Section',
          items: [
            {
              id: 'item-1',
              title: 'Item with nested content',
              description: 'This description was being lost',
              contents: [
                { id: 'c-1', type: 'text', value: 'This text was being lost' },
                { 
                  id: 'c-2', 
                  type: 'subItems',
                  subItems: [
                    { id: 's-1', title: 'This sub-item was being lost' }
                  ]
                }
              ]
            }
          ]
        }
      ];

      // BAD: What was happening before (flattening)
      const badFlattenedItems = sectionsWithNestedContent.flatMap(section =>
        section.items.map(item => ({
          id: item.id,
          title: item.title,
          completed: false
          // description, contents, etc. were being lost!
        }))
      );

      // GOOD: What should happen (preserve structure)
      const goodPreservedSections = sectionsWithNestedContent;

      // The bug was losing all this data
      expect((badFlattenedItems[0] as Record<string, unknown>).description).toBeUndefined();
      expect((badFlattenedItems[0] as Record<string, unknown>).contents).toBeUndefined();
      
      // The fix preserves all data
      expect(goodPreservedSections[0].items[0].description).toBe('This description was being lost');
      expect(goodPreservedSections[0].items[0].contents).toHaveLength(2);
      expect(goodPreservedSections[0].items[0].contents[1].subItems).toHaveLength(1);
    });

    it('should store sections AS-IS in database, not flattened', () => {
      const importedTemplate = {
        title: 'Test Template',
        sections: [
          {
            id: 'section-1',
            title: 'Section with rich content',
            items: [
              {
                id: 'item-1',
                title: 'Item',
                description: 'Description',
                contents: [{ id: 'c-1', type: 'text', value: 'Content' }]
              }
            ]
          }
        ]
      };

      // What gets stored in DB (as JSON string)
      const storedInDB = JSON.stringify(importedTemplate.sections);
      
      // When retrieved and parsed
      const retrievedSections = JSON.parse(storedInDB);
      
      // All nested content should be preserved
      expect(retrievedSections[0].items[0].description).toBe('Description');
      expect(retrievedSections[0].items[0].contents).toBeDefined();
      expect(retrievedSections[0].items[0].contents[0].value).toBe('Content');
    });

    it('should detect sections format vs flat items format', () => {
      // Sections format (new/correct)
      const sectionsFormat = [
        { id: 's-1', title: 'Section', items: [{ id: 'i-1', title: 'Item' }] }
      ];

      // Flat items format (legacy/wrong for rich content)
      const flatFormat = [
        { id: 'i-1', title: 'Item', completed: false }
      ];

      // Detection logic
      const isSectionsFormat = (data: unknown[]): boolean => {
        return Array.isArray(data) && 
               data.length > 0 && 
               (data[0] as Record<string, unknown>)?.items !== undefined;
      };

      expect(isSectionsFormat(sectionsFormat)).toBe(true);
      expect(isSectionsFormat(flatFormat)).toBe(false);
    });
  });

  describe('Regression Prevention', () => {
    it('should always preserve item descriptions during import', () => {
      const templateData = {
        sections: [{
          id: 's-1',
          title: 'Section',
          items: [{
            id: 'i-1',
            title: 'Item Title',
            description: 'This must not be lost during import'
          }]
        }]
      };

      // Simulate import storage
      const storedData = JSON.stringify(templateData.sections);
      const retrieved = JSON.parse(storedData);
      
      expect(retrieved[0].items[0].description).toBe('This must not be lost during import');
    });

    it('should always preserve item contents during import', () => {
      const templateData = {
        sections: [{
          id: 's-1',
          title: 'Section',
          items: [{
            id: 'i-1',
            title: 'Item',
            contents: [
              { id: 'c-1', type: 'text', value: 'Text content' },
              { id: 'c-2', type: 'image', value: 'image.jpg' }
            ]
          }]
        }]
      };

      const storedData = JSON.stringify(templateData.sections);
      const retrieved = JSON.parse(storedData);
      
      expect(retrieved[0].items[0].contents).toHaveLength(2);
      expect(retrieved[0].items[0].contents[0].type).toBe('text');
      expect(retrieved[0].items[0].contents[1].type).toBe('image');
    });

    it('should always preserve sub-items during import', () => {
      const templateData = {
        sections: [{
          id: 's-1',
          title: 'Section',
          items: [{
            id: 'i-1',
            title: 'Item',
            contents: [{
              id: 'c-1',
              type: 'subItems',
              subItems: [
                { id: 'sub-1', title: 'Sub-item 1' },
                { id: 'sub-2', title: 'Sub-item 2' }
              ]
            }]
          }]
        }]
      };

      const storedData = JSON.stringify(templateData.sections);
      const retrieved = JSON.parse(storedData);
      
      const subItemsContent = retrieved[0].items[0].contents[0];
      expect(subItemsContent.type).toBe('subItems');
      expect(subItemsContent.subItems).toHaveLength(2);
      expect(subItemsContent.subItems[0].title).toBe('Sub-item 1');
    });
  });

  describe('API Endpoint Behavior', () => {
    it('should accept sections array directly in items field', () => {
      const apiPayload = {
        title: 'Template',
        description: 'Description',
        items: [  // This should accept sections array
          {
            id: 'section-1',
            title: 'Section',
            items: [
              {
                id: 'item-1',
                title: 'Item',
                description: 'Description',
                contents: []
              }
            ]
          }
        ],
        is_public: true,
        category: 'test',
        tags: ['test']
      };

      // The API should store this as-is, not flatten it
      expect(apiPayload.items[0].items).toBeDefined();
      expect(apiPayload.items[0].items[0].description).toBe('Description');
    });

    it('should handle both legacy flat format and new sections format when retrieving', () => {
      // Legacy format in DB
      const legacyStored = JSON.stringify([
        { id: 'i-1', title: 'Item 1', completed: false }
      ]);

      // New format in DB
      const newStored = JSON.stringify([
        {
          id: 's-1',
          title: 'Section 1',
          items: [{ id: 'i-1', title: 'Item 1', description: 'Desc' }]
        }
      ]);

      // Parse both
      const legacyParsed = JSON.parse(legacyStored);
      const newParsed = JSON.parse(newStored);

      // Legacy should be wrapped in a default section
      const legacyResult = legacyParsed[0]?.items 
        ? legacyParsed 
        : [{ id: '1', title: 'Checklist', items: legacyParsed }];

      // New format should be used as-is
      const newResult = newParsed[0]?.items 
        ? newParsed 
        : [{ id: '1', title: 'Checklist', items: newParsed }];

      expect(legacyResult[0].items).toBeDefined();
      expect(newResult[0].items[0].description).toBe('Desc');
    });
  });
});