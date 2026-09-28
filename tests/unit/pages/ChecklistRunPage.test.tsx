import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { countRunExecutionItems } from '@/features/run-execution/runExecutionMappers';
import ChecklistRunPage from '@/pages/ChecklistRun';
import type { ChecklistRun } from '@/types/checklist';

const mockUseRunExecutionModel = vi.fn();

vi.mock('@/features/run-execution/useRunExecutionModel', () => ({
  useRunExecutionModel: (...args: unknown[]) => mockUseRunExecutionModel(...args),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({
    getRun: vi.fn(),
    updateRun: vi.fn(),
  }),
}));

const workspaceRoles = vi.hoisted(() => ({ roles: {} as Record<string, 'viewer' | 'runner' | 'admin'> }));

vi.mock('@/contexts/WorkspaceContext', async () => {
  const { getResourcePermissions } = await import('@/lib/organizationPermissions');
  return {
    useWorkspace: () => ({
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, (id) => workspaceRoles.roles[id]),
    }),
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/components/shared/SEOHead', () => ({
  SEOHead: () => null,
}));

const baseRun: ChecklistRun = {
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
            'Check for typos and broken links.\nThen verify redirects.\\nFinally submit the report.',
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

describe('ChecklistRunPage layout', () => {
  it('renders the private run inside the shared dashboard shell with one persistent app sidebar', () => {
    mockUseRunExecutionModel.mockReturnValue({
      counts: { progress: 35, subTasksCompleted: 1, subTasksTotal: 6, tasksCompleted: 1, tasksTotal: 3 },
      createShare: vi.fn(),
      history: {
        data: {
          checklistId: 'run-1',
          events: [
            {
              id: 'audit-1',
              action: 'checklist_run.created',
              actor: { name: 'Jane Runner' },
              metadata: {
                source: 'mcp',
                personalRunKeyName: 'Codex SOP Runner',
              },
              createdAt: '2026-07-03T12:00:00.000Z',
            },
          ],
          subject: { type: 'user', id: 'user-1' },
        },
        isError: false,
        isLoading: false,
      },
      isSharedRun: false,
      loadError: null,
      loading: false,
      notFound: false,
      progress: 35,
      run: baseRun,
      saveTitle: vi.fn(),
      selectedData: {
        item: baseRun.sections[0].items[0],
        section: baseRun.sections[0],
      },
      selectedItemId: 'item-1',
      setSelectedItemId: vi.fn(),
      completeRun: vi.fn(),
      toggleItem: vi.fn(),
      saveItemNotes: vi.fn(),
      noteDrafts: {},
      setNoteDraft: vi.fn(),
      hasUnsavedNotes: false,
      toggleSubItem: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <StaticRouter location="/dashboard/runs/run-1">
        <Routes>
          <Route path="/dashboard/runs/:id" element={<ChecklistRunPage />} />
        </Routes>
      </StaticRouter>,
    );

    expect(html).toContain('Progress');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('data-dashboard-page-header="true"');
    expect(html).toContain('data-run-workspace-shell="true"');
    expect(html).toContain('data-mobile-run-progress="true"');
    // Below xl the desktop panel is hidden, so the mobile block must open the task list.
    expect(html).toMatch(/data-mobile-run-progress="true"(?:(?!<\/section>).)*data-mobile-run-tasks-trigger="true"/s);
    expect(html).toContain('data-run-progress-panel="true"');
    expect(html).toContain('Overall Progress');
    expect(html).toContain('Changelog');
    expect(html).toContain('Created run');
    expect(html).toContain('Codex SOP Runner via MCP · authorized by Jane Runner');
    expect(html).toContain('Share');
    expect(html).toContain('Task 1 of 1');
    expect(html).toContain('Mark Complete');
    expect(html).toContain('Task notes');
    expect(html.match(/aria-label="Task notes"/g)).toHaveLength(1);
    expect(html).not.toContain('Notes for Send the approval email');
    expect(html).toContain('whitespace-pre-line');
    expect(html).toContain(
      'Check for typos and broken links.\nThen verify redirects.\nFinally submit the report.',
    );
    expect(html).toContain('min-h-[calc(100dvh-3.5rem)]');
    expect(html).not.toContain('data-run-progress-sidebar="true"');
    expect(html).not.toContain('border-r border-border bg-card xl:flex xl:w-64');
    // The old left-hand "Tasks" outline is gone; the mobile Tasks button is a different control.
    expect(html).not.toMatch(/<h2[^>]*>Tasks<\/h2>/);
    expect(html).not.toContain('Work through the run like a docs outline');
    expect(html).not.toContain('More options');
  });

  it('renders the shared run as the public copyable checklist flow', () => {
    mockUseRunExecutionModel.mockReturnValue({
      counts: { progress: 29, subTasksCompleted: 1, subTasksTotal: 4, tasksCompleted: 1, tasksTotal: 3 },
      createShare: vi.fn(),
      history: {
        data: null,
        isError: false,
        isLoading: false,
      },
      isSharedRun: true,
      loadError: null,
      loading: false,
      notFound: false,
      progress: 29,
      run: {
        ...baseRun,
        title: 'Project Setup Checklist',
      },
      saveTitle: vi.fn(),
      selectedData: {
        item: baseRun.sections[0].items[0],
        section: baseRun.sections[0],
      },
      selectedItemId: 'item-1',
      setSelectedItemId: vi.fn(),
      completeRun: vi.fn(),
      toggleItem: vi.fn(),
      saveItemNotes: vi.fn(),
      noteDrafts: {},
      setNoteDraft: vi.fn(),
      hasUnsavedNotes: false,
      toggleSubItem: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <StaticRouter location="/share/abc123">
        <Routes>
          <Route path="/share/:shareToken" element={<ChecklistRunPage />} />
        </Routes>
      </StaticRouter>,
    );

    expect(html).toContain('Copy Link');
    expect(html).toContain('Browse Public Templates');
    expect(html).toContain('Shared run snapshot');
    expect(html).toContain('Run progress');
    expect(html).toContain('whitespace-pre-line');
    expect(html).toContain(
      'Check for typos and broken links.\nThen verify redirects.\nFinally submit the report.',
    );
    expect(html).not.toContain('Create Your Own Copy');
    expect(html).toContain('max-w-[var(--layout-narrow-max)]');
    expect(html).toContain('rounded-[var(--layout-card-radius)]');
    expect(html).not.toContain('rounded-xl');
    expect(html).not.toContain('Creating link...');
    expect(html).not.toContain('Overall Progress');
    expect(html).not.toContain('Changelog');
  });
});

const twoTaskRun = (completed: [boolean, boolean], status: ChecklistRun['status'] = 'in_progress'): ChecklistRun => ({
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

const renderRunPage = (
  run: ChecklistRun,
  options: { noteDrafts?: Record<string, string>; selectedItemId: string; shared?: boolean },
) => {
  const done = run.sections[0].items.filter((item) => item.isCompleted).length;
  mockUseRunExecutionModel.mockReturnValue({
    counts: countRunExecutionItems(run),
    createShare: vi.fn(),
    history: { data: null, isError: false, isLoading: false },
    isSharedRun: options.shared === true,
    loadError: null,
    loading: false,
    notFound: false,
    progress: done * 50,
    run,
    saveTitle: vi.fn(),
    selectedData: null,
    selectedItemId: options.selectedItemId,
    setSelectedItemId: vi.fn(),
    completeRun: vi.fn(),
    toggleItem: vi.fn(),
    saveItemNotes: vi.fn(),
    noteDrafts: options.noteDrafts ?? {},
    setNoteDraft: vi.fn(),
    hasUnsavedNotes: Object.keys(options.noteDrafts ?? {}).length > 0,
    toggleSubItem: vi.fn(),
  });

  return renderToStaticMarkup(
    <StaticRouter location={options.shared ? '/share/abc123' : '/dashboard/runs/run-1'}>
      <Routes>
        <Route path="/dashboard/runs/:id" element={<ChecklistRunPage />} />
        <Route path="/share/:shareToken" element={<ChecklistRunPage />} />
      </Routes>
    </StaticRouter>,
  );
};

describe('ChecklistRunPage completion', () => {
  it('offers a working finish action on a fully ticked run that is still in progress', () => {
    const html = renderRunPage(twoTaskRun([true, true]), { selectedItemId: 'item-2' });

    expect(html).toContain('Finish Run');
    expect(html).toContain('Complete run');
    expect(html).toContain('In Progress');
  });

  it('offers the finish action in the shared run view too', () => {
    const html = renderRunPage(twoTaskRun([true, true]), { selectedItemId: 'item-1', shared: true });

    expect(html).toContain('Complete run');
  });

  it('points the last task at the open task instead of a dead "Finish Run"', () => {
    const html = renderRunPage(twoTaskRun([false, true]), { selectedItemId: 'item-2' });

    expect(html).toContain('Next unfinished task');
    expect(html).not.toContain('Finish Run');
    expect(html).not.toContain('Complete run');
  });

  it('offers no finish action on a completed run', () => {
    const html = renderRunPage(twoTaskRun([true, true], 'completed'), { selectedItemId: 'item-2' });
    const sharedHtml = renderRunPage(twoTaskRun([true, true], 'completed'), { selectedItemId: 'item-2', shared: true });

    expect(html).not.toContain('Finish Run');
    expect(html).not.toContain('Complete run');
    expect(html).toContain('Run completed');
    expect(sharedHtml).not.toContain('Complete run');
  });
});

// A completed run is frozen: unticking a task would leave it Completed with open tasks.
describe('ChecklistRunPage on a completed run', () => {
  const checkboxes = (html: string) => html.match(/<button[^>]*role="checkbox"[^>]*>/g) ?? [];
  const completedRun = (): ChecklistRun => {
    const run = twoTaskRun([true, true], 'completed');
    run.sections[0].items[0].contents = [
      { type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Step one', isCompleted: true }] },
    ];
    return run;
  };

  it('locks every task and sub-task checkbox in the private view and keeps notes editable', () => {
    const html = renderRunPage(completedRun(), { selectedItemId: 'item-1' });

    expect(html).not.toContain('Mark Complete');
    expect(checkboxes(html).length).toBeGreaterThan(0);
    expect(checkboxes(html).every((tag) => tag.includes('disabled=""'))).toBe(true);
    expect(html).toContain('Save notes');
  });

  it('locks them in the shared view too', () => {
    const html = renderRunPage(completedRun(), { selectedItemId: 'item-1', shared: true });

    expect(checkboxes(html)).toHaveLength(3);
    expect(checkboxes(html).every((tag) => tag.includes('disabled=""'))).toBe(true);
    expect(html).toContain('Save notes');
  });

  it('leaves the checkboxes of an in-progress run enabled', () => {
    const html = renderRunPage(twoTaskRun([false, false]), { selectedItemId: 'item-1', shared: true });

    expect(checkboxes(html).some((tag) => tag.includes('disabled=""'))).toBe(false);
  });
});

describe('ChecklistRunPage task notes', () => {
  it('shows the unsaved draft for the selected task after moving between tasks', () => {
    const run = twoTaskRun([true, false]);
    run.sections[0].items[0].notes = 'saved note';
    const html = renderRunPage(run, {
      noteDrafts: { 'item-1': 'Deployed build 42, see link' },
      selectedItemId: 'item-1',
    });

    expect(html).toContain('>Deployed build 42, see link</textarea>');
  });

  it('shows the drafts in the shared run view too', () => {
    const html = renderRunPage(twoTaskRun([false, false]), {
      noteDrafts: { 'item-2': 'Guest note in progress' },
      selectedItemId: 'item-1',
      shared: true,
    });

    expect(html).toContain('>Guest note in progress</textarea>');
  });
});

describe('ChecklistRunPage Organization roles', () => {
  const organizationRun = (): ChecklistRun => ({ ...twoTaskRun([false, false]), teamId: 'acme' });

  it('renders an Organization run read-only for a viewer, even from the Personal context', () => {
    workspaceRoles.roles = { acme: 'viewer' };
    const html = renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).toContain('View only');
    expect(html).not.toContain('Mark Complete');
    expect(html).not.toContain('Rename');
    expect(html).not.toMatch(/>Share</);
    expect(html).not.toContain('Save notes');
    expect(html).toContain('readonly=""');
  });

  it('treats a run of an Organization the user is not (yet) known to belong to as read-only', () => {
    workspaceRoles.roles = {};
    const html = renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).not.toContain('Mark Complete');
  });

  it('lets a runner execute, rename and share the Organization run', () => {
    workspaceRoles.roles = { acme: 'runner' };
    const html = renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).toContain('Mark Complete');
    expect(html).toContain('Rename');
    expect(html).toMatch(/>Share</);
    expect(html).toContain('Save notes');
    expect(html).not.toContain('View only');
  });

  it('keeps the shared run editable for guests: the share link governs it, not roles', () => {
    workspaceRoles.roles = {};
    const html = renderRunPage(organizationRun(), { selectedItemId: 'item-1', shared: true });

    expect(html).toContain('Save notes');
    expect(html).not.toContain('View only');
  });
});


// Sub-tasks are not tasks: every "tasks" count on the page matches the task list, the
// "Task N of M" badge and the runs list.
describe('ChecklistRunPage task counts', () => {
  const taskWithSubTasks = (id: string, ticked: number) => ({
    id,
    title: `Task ${id}`,
    isCompleted: false,
    contents: [
      {
        type: 'subItems' as const,
        value: '',
        subItems: [0, 1, 2].map((index) => ({ id: `${id}-${index}`, title: `Step ${id}${index}`, isCompleted: index < ticked })),
      },
    ],
  });
  // Three tasks with three sub-tasks each, one sub-task ticked: 1 of 12 units, 8%.
  const runWithSubTasks = (): ChecklistRun => ({
    ...baseRun,
    progress: 8,
    sections: [
      {
        id: 'section-1',
        title: 'Pre-Launch',
        items: [taskWithSubTasks('a', 1), taskWithSubTasks('b', 0), taskWithSubTasks('c', 0)],
      },
    ],
  });

  it('shows the same task total in the header, the progress block and the task list', () => {
    const html = renderRunPage(runWithSubTasks(), { selectedItemId: 'a' });

    expect(html.match(/0 of 3 tasks finished/g)).toHaveLength(2);
    expect(html).toContain('0 / 3 tasks');
    expect(html).toContain('Task 1 of 3');
    expect(html).not.toMatch(/(of|\/) 12/);
  });

  it('fills the task list bar with the same overall progress as the header', () => {
    const html = renderRunPage(runWithSubTasks(), { selectedItemId: 'a' });

    expect(html.match(/width:8%/g)).toHaveLength(2);
    expect(html).not.toContain('width:0%');
  });

  it('counts tasks, not sub-tasks, in the shared view', () => {
    const html = renderRunPage(runWithSubTasks(), { selectedItemId: 'a', shared: true });

    expect(html).toContain('0 of 3 tasks');
    expect(html).not.toMatch(/of 12/);
  });
});

describe('ChecklistRunPage task checkboxes', () => {
  const taskCheckboxes = (html: string) =>
    (html.match(/<button[^>]*role="checkbox"[^>]*>/g) ?? []).filter((tag) => /aria-label="Mark /.test(tag));

  it('names the task checkbox and shows its state in the private view', () => {
    const html = renderRunPage(twoTaskRun([true, false]), { selectedItemId: 'item-1' });

    expect(taskCheckboxes(html)).toHaveLength(1);
    expect(taskCheckboxes(html)[0]).toContain('aria-label="Mark &quot;First task&quot; complete"');
    expect(taskCheckboxes(html)[0]).toContain('aria-checked="true"');
  });

  it('names every task checkbox in the shared view', () => {
    const html = renderRunPage(twoTaskRun([true, false]), { selectedItemId: 'item-1', shared: true });
    const [first, last] = taskCheckboxes(html);

    expect(taskCheckboxes(html)).toHaveLength(2);
    expect(first).toContain('aria-label="Mark &quot;First task&quot; complete"');
    expect(first).toContain('aria-checked="true"');
    expect(last).toContain('aria-label="Mark &quot;Last task&quot; complete"');
    expect(last).toContain('aria-checked="false"');
  });
});
