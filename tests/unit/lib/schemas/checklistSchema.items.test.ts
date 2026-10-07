import { describe, it, expect } from 'vitest';
import {
  checklistSubItemSchema,
  checklistItemContentSchema,
  checklistItemSchema,
  checklistSectionSchema,
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
});
