import { vi } from 'vitest';

import type { ChecklistRun } from '@/types/checklist';

export const runExecutionApiClient = () => ({
  createChecklistRunShare: vi.fn(),
  getChecklistById: vi.fn(),
  getSharedChecklist: vi.fn(),
  revokeChecklistRunShare: vi.fn(),
  updateSharedChecklist: vi.fn(async (_shareToken: string, body: { expected_revision?: number | undefined }) => ({
    success: true as const,
    revision: body.expected_revision ?? 1,
    progress: 0,
  })),
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

export const runWithNotes = (notes: Record<string, string | undefined>): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: 'Launch',
  status: 'in_progress',
  progress: 0,
  sections: [
    {
      id: 'section-1',
      title: 'Checklist',
      items: Object.entries(notes).map(([id, value]) => ({ id, title: id, ...(value === undefined ? {} : { notes: value }) })),
    },
  ],
  startedAt: '2026-01-01T00:00:00.000Z',
  userId: 'user-1',
});
