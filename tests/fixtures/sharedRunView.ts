import type React from 'react';
import { vi } from 'vitest';

import type { SharedRunView } from '@/components/run-execution/SharedRunView';
import type { ChecklistItem, ChecklistRun } from '@/types/checklist';

export type SharedRunViewProps = React.ComponentProps<typeof SharedRunView>;

export const sharedRunOf = (items: ChecklistItem[], status: ChecklistRun['status'] = 'in_progress'): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: 'New client',
  status,
  progress: 0,
  sections: [{ id: 'section-1', title: 'Intake', items }],
  startedAt: '2026-10-05T08:00:00.000Z',
  userId: 'user-1',
});

export const sharedRunViewProps = (run: ChecklistRun, overrides: Partial<SharedRunViewProps> = {}): SharedRunViewProps => ({
  completedTasks: 0,
  finishRunButton: null,
  isRunCompleted: run.status === 'completed',
  noteDrafts: {},
  onCopyLink: vi.fn(),
  onNoteDraftChange: vi.fn(),
  onSaveNotes: vi.fn(async () => true),
  onToggleSubItem: vi.fn(),
  onToggleTask: vi.fn(),
  progress: 0,
  run,
  sectionProgress: run.sections.map((section, index) => ({
    completed: section.items.filter((item) => item.isCompleted).length,
    index,
    section,
    total: section.items.length,
  })),
  totalTasks: run.sections.reduce((count, section) => count + section.items.length, 0),
  ...overrides,
});
