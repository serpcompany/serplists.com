import type { ChecklistTemplate as StoredChecklistTemplate } from '@/lib/schemas/checklistSchema';
import type { ChecklistTemplate } from '@/types/checklist';

type TemplateTheAppAndABackupBothHold = ChecklistTemplate & StoredChecklistTemplate;

export const createMockTemplate = (
  overrides: Partial<TemplateTheAppAndABackupBothHold> = {},
): TemplateTheAppAndABackupBothHold => ({
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
