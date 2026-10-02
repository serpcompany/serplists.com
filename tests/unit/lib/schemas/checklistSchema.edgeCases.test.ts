import { describe, it, expect } from 'vitest';
import { checklistItemContentSchema, checklistTemplateSchema } from '@/lib/schemas/checklistSchema';

describe('Checklist Schema Validation', () => {
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

    it('accepts an empty title, description and slug and empty category and tag lists', () => {
      const emptyStringsTemplate = {
        id: 'empty-1',
        title: '',
        description: '',
        sections: [],
        userId: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isPublic: false,
        slug: '',
        categories: [],
        tags: []
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
        fileSize: 5 * 1024 ** 3
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
