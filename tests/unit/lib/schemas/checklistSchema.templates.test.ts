import { describe, it, expect } from 'vitest';
import {
  checklistTemplateSchema,
  templateBackupSchema,
  validateTemplate,
  validateBackup,
  validateTemplateArray
} from '@/lib/schemas/checklistSchema';

describe('Checklist Schema Validation', () => {
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
});
