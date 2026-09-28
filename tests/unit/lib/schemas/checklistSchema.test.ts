import { describe, it, expect } from 'vitest';
import {
  checklistSubItemSchema,
  checklistItemContentSchema,
  checklistItemSchema,
  checklistSectionSchema,
  checklistTemplateSchema,
  templateBackupSchema,
  validateTemplate,
  validateBackup,
  validateTemplateArray
} from '@/lib/schemas/checklistSchema';

describe('Checklist Schema Validation', () => {
  describe('checklistSubItemSchema', () => {
    it('should validate a valid sub-item', () => {
      const validSubItem = {
        id: 'sub-1',
        title: 'Sub task 1',
        isCompleted: false
      };
      
      const result = checklistSubItemSchema.safeParse(validSubItem);
      expect(result.success).toBe(true);
    });

    it('should require id and title', () => {
      const invalidSubItem = {
        title: 'Missing ID'
      };
      
      const result = checklistSubItemSchema.safeParse(invalidSubItem);
      expect(result.success).toBe(false);
    });

    it('should allow optional isCompleted', () => {
      const subItemWithoutCompleted = {
        id: 'sub-1',
        title: 'Sub task'
      };
      
      const result = checklistSubItemSchema.safeParse(subItemWithoutCompleted);
      expect(result.success).toBe(true);
    });
  });

  describe('checklistItemContentSchema', () => {
    it('should validate text content', () => {
      const textContent = {
        id: 'content-1',
        type: 'text',
        value: '**Bold text** and _italic_'
      };
      
      const result = checklistItemContentSchema.safeParse(textContent);
      expect(result.success).toBe(true);
    });

    it('should validate image content with URL', () => {
      const imageContent = {
        id: 'content-2',
        type: 'image',
        value: 'https://example.com/image.jpg',
        uploadType: 'url'
      };
      
      const result = checklistItemContentSchema.safeParse(imageContent);
      expect(result.success).toBe(true);
    });

    it('should validate video content with upload', () => {
      const videoContent = {
        id: 'content-3',
        type: 'video',
        value: 'uploads/video.mp4',
        uploadType: 'upload',
        fileName: 'tutorial.mp4',
        fileSize: 10485760
      };
      
      const result = checklistItemContentSchema.safeParse(videoContent);
      expect(result.success).toBe(true);
    });

    it('should validate subItems content', () => {
      const subItemsContent = {
        id: 'content-4',
        type: 'subItems',
        value: '',
        subItems: [
          { id: 'sub-1', title: 'Subtask 1' },
          { id: 'sub-2', title: 'Subtask 2', isCompleted: true }
        ]
      };
      
      const result = checklistItemContentSchema.safeParse(subItemsContent);
      expect(result.success).toBe(true);
    });

    it('should reject invalid content type', () => {
      const invalidContent = {
        id: 'content-bad',
        type: 'invalid-type',
        value: 'some value'
      };
      
      const result = checklistItemContentSchema.safeParse(invalidContent);
      expect(result.success).toBe(false);
    });

    it('should reject invalid uploadType', () => {
      const invalidUploadType = {
        id: 'content-bad',
        type: 'image',
        value: 'image.jpg',
        uploadType: 'invalid'
      };
      
      const result = checklistItemContentSchema.safeParse(invalidUploadType);
      expect(result.success).toBe(false);
    });
  });

  describe('checklistItemSchema', () => {
    it('should validate a complete item', () => {
      const validItem = {
        id: 'item-1',
        title: 'Main task',
        description: 'Task description',
        contents: [
          {
            id: 'content-1',
            type: 'text',
            value: 'Some text content'
          }
        ],
        isCompleted: false
      };
      
      const result = checklistItemSchema.safeParse(validItem);
      expect(result.success).toBe(true);
    });

    it('should validate minimal item', () => {
      const minimalItem = {
        id: 'item-1',
        title: 'Simple task'
      };
      
      const result = checklistItemSchema.safeParse(minimalItem);
      expect(result.success).toBe(true);
    });

    it('should validate item with multiple content types', () => {
      const complexItem = {
        id: 'item-1',
        title: 'Complex task',
        contents: [
          { id: 'c1', type: 'text', value: 'Instructions' },
          { id: 'c2', type: 'image', value: 'diagram.png' },
          { id: 'c3', type: 'video', value: 'tutorial.mp4' },
          {
            id: 'c4',
            type: 'subItems',
            value: '',
            subItems: [
              { id: 's1', title: 'Step 1' },
              { id: 's2', title: 'Step 2' }
            ]
          }
        ]
      };
      
      const result = checklistItemSchema.safeParse(complexItem);
      expect(result.success).toBe(true);
    });
  });

  describe('checklistSectionSchema', () => {
    it('should validate a section with items', () => {
      const validSection = {
        id: 'section-1',
        title: 'Planning Phase',
        items: [
          { id: 'item-1', title: 'Research' },
          { id: 'item-2', title: 'Budget', description: 'Create budget plan' }
        ]
      };
      
      const result = checklistSectionSchema.safeParse(validSection);
      expect(result.success).toBe(true);
    });

    it('should require items array', () => {
      const sectionWithoutItems = {
        id: 'section-1',
        title: 'Empty Section'
      };
      
      const result = checklistSectionSchema.safeParse(sectionWithoutItems);
      expect(result.success).toBe(false);
    });

    it('should allow empty items array', () => {
      const emptySection = {
        id: 'section-1',
        title: 'Empty Section',
        items: []
      };
      
      const result = checklistSectionSchema.safeParse(emptySection);
      expect(result.success).toBe(true);
    });
  });

  describe('checklistTemplateSchema', () => {
    it('should validate a complete template', () => {
      const validTemplate = {
        id: 'template-1',
        title: 'Moving Checklist',
        description: 'Complete moving guide',
        sections: [
          {
            id: 'section-1',
            title: 'Planning',
            items: [
              { id: 'item-1', title: 'Research movers' }
            ]
          }
        ],
        userId: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        isPublic: true,
        slug: 'moving-checklist',
        categories: ['moving', 'organization'],
        tags: ['relocation', 'planning']
      };
      
      const result = checklistTemplateSchema.safeParse(validTemplate);
      expect(result.success).toBe(true);
    });

    it('should validate minimal template', () => {
      const minimalTemplate = {
        id: 'template-1',
        title: 'Simple Checklist',
        sections: [],
        userId: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isPublic: false
      };
      
      const result = checklistTemplateSchema.safeParse(minimalTemplate);
      expect(result.success).toBe(true);
    });

    it('should reject template without required fields', () => {
      const invalidTemplate = {
        title: 'Missing Required Fields',
        sections: []
      };
      
      const result = checklistTemplateSchema.safeParse(invalidTemplate);
      expect(result.success).toBe(false);
    });

    it('should validate template with nested content', () => {
      const nestedTemplate = {
        id: 'template-1',
        title: 'Nested Template',
        sections: [
          {
            id: 's1',
            title: 'Section 1',
            items: [
              {
                id: 'i1',
                title: 'Item with content',
                contents: [
                  {
                    id: 'c1',
                    type: 'subItems',
                    value: '',
                    subItems: [
                      { id: 'sub1', title: 'Subtask 1' },
                      { id: 'sub2', title: 'Subtask 2', isCompleted: true }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        userId: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isPublic: true
      };
      
      const result = checklistTemplateSchema.safeParse(nestedTemplate);
      expect(result.success).toBe(true);
    });
  });

  describe('templateBackupSchema', () => {
    it('should validate a complete backup', () => {
      const validBackup = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00Z',
        exportedBy: 'user@example.com',
        templates: [
          {
            id: 'template-1',
            title: 'Template 1',
            sections: [],
            userId: 'user-123',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            isPublic: true
          }
        ],
        metadata: {
          totalTemplates: 1,
          publicTemplates: 1,
          privateTemplates: 0
        }
      };
      
      const result = templateBackupSchema.safeParse(validBackup);
      expect(result.success).toBe(true);
    });

    it('should validate backup without optional fields', () => {
      const minimalBackup = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00Z',
        templates: []
      };
      
      const result = templateBackupSchema.safeParse(minimalBackup);
      expect(result.success).toBe(true);
    });

    it('should reject backup without required fields', () => {
      const invalidBackup = {
        templates: []
      };
      
      const result = templateBackupSchema.safeParse(invalidBackup);
      expect(result.success).toBe(false);
    });
  });

  describe('Validation helper functions', () => {
    describe('validateTemplate', () => {
      it('should parse valid template', () => {
        const validData = {
          id: 'template-1',
          title: 'Valid Template',
          sections: [],
          userId: 'user-123',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          isPublic: true
        };
        
        expect(() => validateTemplate(validData)).not.toThrow();
        const result = validateTemplate(validData);
        expect(result.title).toBe('Valid Template');
      });

      it('should throw on invalid template', () => {
        const invalidData = {
          title: 'Invalid Template'
        };
        
        expect(() => validateTemplate(invalidData)).toThrow();
      });
    });

    describe('validateBackup', () => {
      it('should parse valid backup', () => {
        const validData = {
          version: '1.0.0',
          exportedAt: '2024-01-01T00:00:00Z',
          templates: []
        };
        
        expect(() => validateBackup(validData)).not.toThrow();
        const result = validateBackup(validData);
        expect(result.version).toBe('1.0.0');
      });

      it('should throw on invalid backup', () => {
        const invalidData = {
          templates: []
        };
        
        expect(() => validateBackup(invalidData)).toThrow();
      });
    });

    describe('validateTemplateArray', () => {
      it('should parse valid template array', () => {
        const validData = [
          {
            id: 'template-1',
            title: 'Template 1',
            sections: [],
            userId: 'user-123',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            isPublic: true
          },
          {
            id: 'template-2',
            title: 'Template 2',
            sections: [],
            userId: 'user-123',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            isPublic: false
          }
        ];
        
        expect(() => validateTemplateArray(validData)).not.toThrow();
        const result = validateTemplateArray(validData);
        expect(result).toHaveLength(2);
      });

      it('should throw on invalid array', () => {
        const invalidData = [
          { title: 'Missing required fields' }
        ];
        
        expect(() => validateTemplateArray(invalidData)).toThrow();
      });

      it('should throw on non-array input', () => {
        const invalidData = { not: 'an array' };
        
        expect(() => validateTemplateArray(invalidData)).toThrow();
      });
    });
  });

  describe('Edge cases and data integrity', () => {
    it('should handle deeply nested structures', () => {
      const deepTemplate = {
        id: 'deep-1',
        title: 'Deep Nesting Test',
        sections: Array(10).fill(null).map((_, sIdx) => ({
          id: `section-${sIdx}`,
          title: `Section ${sIdx}`,
          items: Array(5).fill(null).map((_, iIdx) => ({
            id: `item-${sIdx}-${iIdx}`,
            title: `Item ${iIdx}`,
            contents: [
              {
                id: `content-${sIdx}-${iIdx}`,
                type: 'subItems',
                value: '',
                subItems: Array(3).fill(null).map((_, subIdx) => ({
                  id: `sub-${sIdx}-${iIdx}-${subIdx}`,
                  title: `Subtask ${subIdx}`
                }))
              }
            ]
          }))
        })),
        userId: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isPublic: true
      };
      
      const result = checklistTemplateSchema.safeParse(deepTemplate);
      expect(result.success).toBe(true);
    });

    it('should handle special characters in text fields', () => {
      const specialCharsTemplate = {
        id: 'special-1',
        title: 'Special 特殊文字 🎉 <script>alert("test")</script>',
        description: 'Line 1\nLine 2\tTabbed\r\nWindows EOL',
        sections: [
          {
            id: 's1',
            title: 'Section with "quotes" and \'apostrophes\'',
            items: [
              {
                id: 'i1',
                title: 'Item with & ampersand and < > brackets',
                contents: [
                  {
                    id: 'c1',
                    type: 'text',
                    value: '```javascript\nconst test = "code";\n```'
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
        tags: ['tag/with/slash', 'tag-with-dash', 'tag_with_underscore']
      };
      
      const result = checklistTemplateSchema.safeParse(specialCharsTemplate);
      expect(result.success).toBe(true);
    });

    it('should handle empty strings vs null/undefined', () => {
      const emptyStringsTemplate = {
        id: 'empty-1',
        title: '', // Empty string should be valid
        description: '', // Empty optional field
        sections: [],
        userId: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isPublic: false,
        slug: '', // Empty slug
        categories: [], // Empty array
        tags: [] // Empty array
      };
      
      const result = checklistTemplateSchema.safeParse(emptyStringsTemplate);
      expect(result.success).toBe(true);
    });

    it('should validate large file sizes', () => {
      const largeFileContent = {
        id: 'large-file',
        type: 'video',
        value: 'large-video.mp4',
        uploadType: 'upload',
        fileName: 'presentation.mp4',
        fileSize: 5368709120 // 5GB
      };
      
      const result = checklistItemContentSchema.safeParse(largeFileContent);
      expect(result.success).toBe(true);
    });

    it('should handle malformed JSON-like strings in values', () => {
      const jsonInValues = {
        id: 'json-1',
        title: 'Template with JSON',
        description: '{"this": "looks like JSON but is just text"}',
        sections: [
          {
            id: 's1',
            title: 'Section',
            items: [
              {
                id: 'i1',
                title: 'Item',
                contents: [
                  {
                    id: 'c1',
                    type: 'text',
                    value: '{"nested": {"json": "structure"}}'
                  }
                ]
              }
            ]
          }
        ],
        userId: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isPublic: true
      };
      
      const result = checklistTemplateSchema.safeParse(jsonInValues);
      expect(result.success).toBe(true);
    });
  });
});
