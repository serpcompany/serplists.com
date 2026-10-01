import { renderPageAt } from './mockedNextNavigation';
import { vi } from 'vitest';

import './mockedWorkspaceRoles';

import { countRunExecutionItems } from '@/features/run-execution/runExecutionMappers';
import ChecklistRunPage from '@/views/ChecklistRun';
import type { ChecklistRun } from '@/types/checklist';

export const mockUseRunExecutionModel = vi.fn();

vi.mock('@/features/run-execution/useRunExecutionModel', () => ({
  useRunExecutionModel: (...args: unknown[]) => mockUseRunExecutionModel(...args),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'jane@test.com' } }),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({
    getRun: vi.fn(),
    updateRun: vi.fn(),
  }),
}));


vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

export const baseRun: ChecklistRun = {
  id: 'run-1',
  templateId: 'template-1',
  title: 'Website Launch Checklist',
  status: 'in_progress',
  progress: 35,
  sections: [
    {
      id: 'section-1',
      title: 'Pre-Launch',
      items: [
        {
          id: 'item-1',
          title: 'Review all page content',
          description:
            'Check for typos and broken links.\nThen save to C:\\new_folder\nFinally submit the report.',
          isCompleted: false,
          contents: [
            {
              type: 'subItems',
              value: '',
              subItems: [
                { id: 'sub-1', title: 'Send the approval email', isCompleted: false },
              ],
            },
          ],
        },
      ],
    },
  ],
  startedAt: '2026-04-18T00:00:00.000Z',
  userId: 'user-1',
  templateVersion: 1,
};

export const runPageModel = (overrides: Record<string, unknown>) => ({
  createShare: vi.fn(),
  history: { data: null, isError: false, isLoading: false },
  isSharedRun: false,
  loadError: null,
  loading: false,
  notFound: false,
  saveTitle: vi.fn(),
  selectedData: null,
  setSelectedItemId: vi.fn(),
  completeRun: vi.fn(),
  toggleItem: vi.fn(),
  saveItemNotes: vi.fn(),
  noteDrafts: {},
  setNoteDraft: vi.fn(),
  hasUnsavedNotes: false,
  toggleSubItem: vi.fn(),
  ...overrides,
});

export { workspaceRoles } from './mockedWorkspaceRoles';

export const twoTaskRun = (completed: [boolean, boolean], status: ChecklistRun['status'] = 'in_progress'): ChecklistRun => ({
  ...baseRun,
  status,
  sections: [
    {
      id: 'section-1',
      title: 'Pre-Launch',
      items: [
        { id: 'item-1', title: 'First task', isCompleted: completed[0] },
        { id: 'item-2', title: 'Last task', isCompleted: completed[1] },
      ],
    },
  ],
});

export const renderRunPage = (
  run: ChecklistRun,
  options: { noteDrafts?: Record<string, string>; selectedItemId: string; shared?: boolean },
) => {
  const done = run.sections[0].items.filter((item) => item.isCompleted).length;
  mockUseRunExecutionModel.mockReturnValue(runPageModel({
    counts: countRunExecutionItems(run),
    isSharedRun: options.shared === true,
    progress: done * 50,
    run,
    selectedItemId: options.selectedItemId,
    noteDrafts: options.noteDrafts ?? {},
    hasUnsavedNotes: Object.keys(options.noteDrafts ?? {}).length > 0,
  }));

  return renderPageAt(options.shared ? '/share/abc123' : '/dashboard/runs/run-1', {
    '/dashboard/runs/[id]': <ChecklistRunPage />,
    '/share/[shareToken]': <ChecklistRunPage />,
  });
};
