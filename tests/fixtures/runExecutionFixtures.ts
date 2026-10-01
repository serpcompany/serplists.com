import { vi } from 'vitest';

import type { ChecklistRun } from '@/types/checklist';

export const runExecutionApiClient = () => ({
  createChecklistRunShare: vi.fn(),
  getChecklistById: vi.fn(),
  getSharedChecklist: vi.fn(),
  revokeChecklistRunShare: vi.fn(),
  updateSharedChecklist: vi.fn(),
});

export const buildRun = (overrides: Partial<ChecklistRun> = {}): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: 'Launch checklist',
  status: 'in_progress',
  progress: 0,
  sections: [
    {
      id: 'section-1',
      title: 'Checklist',
      items: [
        {
          id: 'item-1',
          title: 'First item',
          isCompleted: false,
          contents: [
            {
              type: 'subItems',
              value: '',
              subItems: [
                { id: 'sub-1', title: 'Sub item 1', isCompleted: false },
                { id: 'sub-2', title: 'Sub item 2', isCompleted: false },
              ],
            },
          ],
        },
        {
          id: 'item-2',
          title: 'Second item',
          isCompleted: true,
          contents: [],
        },
      ],
    },
  ],
  startedAt: '2026-04-18T00:00:00.000Z',
  userId: 'user-1',
  templateVersion: 1,
  revision: 1,
  ...overrides,
});

export const withEveryTaskAndSubTaskTicked = (run: ChecklistRun): ChecklistRun => ({
  ...run,
  sections: run.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      isCompleted: true,
      contents: item.contents?.map((content) => ({
        ...content,
        subItems: content.subItems?.map((subItem) => ({ ...subItem, isCompleted: true })),
      })),
    })),
  })),
});
