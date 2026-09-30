import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { surfaceVariants } from '@/components/layout/page-shell.styles';
import { countRunExecutionItems } from '@/features/run-execution/runExecutionMappers';
import ChecklistRunPage from '@/views/ChecklistRun';
import type { ChecklistRun } from '@/types/checklist';

import { renderPageAt } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

const mockUseRunExecutionModel = vi.fn();

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

const workspaceRoles = vi.hoisted(() => ({
  roles: {} as Record<string, 'viewer' | 'runner' | 'admin'>,
  // The teams request failed with no list, as WorkspaceProvider reports it.
  teamsUnavailable: false,
}));

vi.mock('@/contexts/WorkspaceContext', async () => {
  const { getResourcePermissions } = await import('@/lib/organizationPermissions');
  return {
    useWorkspace: () => ({
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, (id) => workspaceRoles.roles[id]),
      isRoleUnavailable: (teamId?: string) =>
        Boolean(teamId) && workspaceRoles.teamsUnavailable && !(teamId! in workspaceRoles.roles),
      retryWorkspace: vi.fn(),
    }),
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
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

describe('ChecklistRunPage layout', () => {
  it('renders the private run inside the shared dashboard shell with one persistent app sidebar', async () => {
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

    const html = renderPageAt('/dashboard/runs/run-1', { '/dashboard/runs/[id]': <ChecklistRunPage /> });

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
      'Check for typos and broken links.\nThen save to C:\\new_folder\nFinally submit the report.',
    );
    expect(html).toContain('min-h-[calc(100dvh-3.5rem)]');
    // The task footer sticks to the bottom of the window, which needs every box around it
    // to clip rather than scroll (a scroll container would hold the sticky footer instead).
    expect(html).toMatch(/class="[^"]*\bsticky bottom-0\b[^"]*" data-task-footer="true"/);
    expect(html).toMatch(/class="[^"]*\boverflow-clip\b[^"]*" data-dashboard-content-shell="true"/);
    expect(html).toMatch(/class="[^"]*\boverflow-clip\b[^"]*" data-dashboard-page-body="true"/);
    expect(html).not.toMatch(/class="[^"]*\boverflow-(auto|hidden)\b[^"]*" data-dashboard-(content-shell|page-body)="true"/);
    expect(html).not.toContain('data-run-progress-sidebar="true"');
    expect(html).not.toContain('border-r border-border bg-card xl:flex xl:w-64');
    // The old left-hand "Tasks" outline is gone; the mobile Tasks button is a different control.
    expect(html).not.toMatch(/<h2[^>]*>Tasks<\/h2>/);
    expect(html).not.toContain('Work through the run like a docs outline');
    expect(html).not.toContain('More options');
  });

  it('renders the shared run as the public copyable checklist flow', async () => {
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

    const html = renderPageAt('/share/abc123', { '/share/[shareToken]': <ChecklistRunPage /> });

    expect(html).toContain('Copy Link');
    expect(html).toContain('Browse the Template Library');
    expect(html).toContain('Shared run snapshot');
    expect(html).toContain('Run progress');
    expect(html).toContain('whitespace-pre-line');
    expect(html).toContain(
      'Check for typos and broken links.\nThen save to C:\\new_folder\nFinally submit the report.',
    );
    expect(html).not.toContain('Create Your Own Copy');
    // The shared page shell: its narrow container and its surfaces.
    expect(html).toContain('data-page-container="narrow"');
    expect(html).toContain(surfaceVariants({ padding: 'md' }));
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

  return renderPageAt(options.shared ? '/share/abc123' : '/dashboard/runs/run-1', {
    '/dashboard/runs/[id]': <ChecklistRunPage />,
    '/share/[shareToken]': <ChecklistRunPage />,
  });
};

describe('ChecklistRunPage completion', () => {
  it('offers a working finish action on a fully ticked run that is still in progress', async () => {
    const html = await renderRunPage(twoTaskRun([true, true]), { selectedItemId: 'item-2' });

    expect(html).toContain('Finish Run');
    expect(html).toContain('Complete run');
    expect(html).toContain('In Progress');
  });

  it('offers the finish action in the shared run view too', async () => {
    const html = await renderRunPage(twoTaskRun([true, true]), { selectedItemId: 'item-1', shared: true });

    expect(html).toContain('Complete run');
  });

  it('points the last task at the open task instead of a dead "Finish Run"', async () => {
    const html = await renderRunPage(twoTaskRun([false, true]), { selectedItemId: 'item-2' });

    expect(html).toContain('Next unfinished task');
    expect(html).not.toContain('Finish Run');
    expect(html).not.toContain('Complete run');
  });

  // Every task ticked, but the first still has an open Sub-task (older runs, API writes).
  it('points the last task at a ticked task with an open Sub-task, never "Run completed"', async () => {
    const run = twoTaskRun([true, true]);
    run.sections[0].items[0].contents = [
      { type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Step one', isCompleted: false }] },
    ];
    const html = await renderRunPage(run, { selectedItemId: 'item-2' });

    expect(html).toContain('In Progress');
    expect(html).toContain('Next unfinished task');
    expect(html).not.toContain('Run completed');
    expect(html).not.toContain('Complete run');
  });

  it('offers no finish action on a completed run', async () => {
    const html = await renderRunPage(twoTaskRun([true, true], 'completed'), { selectedItemId: 'item-2' });
    const sharedHtml = await renderRunPage(twoTaskRun([true, true], 'completed'), { selectedItemId: 'item-2', shared: true });

    expect(html).not.toContain('Finish Run');
    expect(html).not.toContain('Complete run');
    expect(html).toContain('Run completed');
    expect(sharedHtml).not.toContain('Complete run');
  });
});

// A completed run is frozen: unticking a task would leave it Completed with open tasks.
describe('ChecklistRunPage on a completed run', () => {
  // Any element with the checkbox role: the task's own <button> and the sub-tasks' Base UI
  // checkboxes (<span role="checkbox">, disabled through aria-disabled).
  const checkboxes = (html: string) => html.match(/<[a-z]+[^>]*role="checkbox"[^>]*>/g) ?? [];
  const isLocked = (tag: string) => tag.includes('disabled=""') || tag.includes('aria-disabled="true"');
  const completedRun = (): ChecklistRun => {
    const run = twoTaskRun([true, true], 'completed');
    run.sections[0].items[0].contents = [
      { type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Step one', isCompleted: true }] },
    ];
    return run;
  };

  it('locks every task and sub-task checkbox in the private view and keeps notes editable', async () => {
    const html = await renderRunPage(completedRun(), { selectedItemId: 'item-1' });

    expect(html).not.toContain('Mark Complete');
    expect(checkboxes(html).length).toBeGreaterThan(0);
    expect(checkboxes(html).every(isLocked)).toBe(true);
    expect(html).toContain('Save notes');
  });

  it('locks them in the shared view too', async () => {
    const html = await renderRunPage(completedRun(), { selectedItemId: 'item-1', shared: true });

    expect(checkboxes(html)).toHaveLength(3);
    expect(checkboxes(html).every(isLocked)).toBe(true);
    expect(html).toContain('Save notes');
  });

  it('leaves the checkboxes of an in-progress run enabled', async () => {
    const html = await renderRunPage(twoTaskRun([false, false]), { selectedItemId: 'item-1', shared: true });

    expect(checkboxes(html).some(isLocked)).toBe(false);
  });
});

describe('ChecklistRunPage task notes', () => {
  it('shows the unsaved draft for the selected task after moving between tasks', async () => {
    const run = twoTaskRun([true, false]);
    run.sections[0].items[0].notes = 'saved note';
    const html = await renderRunPage(run, {
      noteDrafts: { 'item-1': 'Deployed build 42, see link' },
      selectedItemId: 'item-1',
    });

    expect(html).toContain('>Deployed build 42, see link</textarea>');
  });

  it('shows the drafts in the shared run view too', async () => {
    const html = await renderRunPage(twoTaskRun([false, false]), {
      noteDrafts: { 'item-2': 'Guest note in progress' },
      selectedItemId: 'item-1',
      shared: true,
    });

    expect(html).toContain('>Guest note in progress</textarea>');
  });
});

describe('ChecklistRunPage Organization roles', () => {
  const organizationRun = (): ChecklistRun => ({ ...twoTaskRun([false, false]), teamId: 'acme' });

  it('renders an Organization run read-only for a viewer, even from the Personal context', async () => {
    workspaceRoles.roles = { acme: 'viewer' };
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).toContain('View only');
    expect(html).not.toContain('Mark Complete');
    expect(html).not.toContain('Rename');
    expect(html).not.toMatch(/>Share</);
    expect(html).not.toContain('Save notes');
    expect(html).toContain('readOnly=""');
  });

  it('treats a run of an Organization the user is not (yet) known to belong to as read-only', async () => {
    workspaceRoles.roles = {};
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).not.toContain('Mark Complete');
  });

  it('lets a runner execute, rename and share the Organization run', async () => {
    workspaceRoles.roles = { acme: 'runner' };
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).toContain('Mark Complete');
    expect(html).toContain('Rename');
    expect(html).toMatch(/>Share</);
    expect(html).toContain('Save notes');
    expect(html).not.toContain('View only');
  });

  it('keeps the shared run editable for guests: the share link governs it, not roles', async () => {
    workspaceRoles.roles = {};
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1', shared: true });

    expect(html).toContain('Save notes');
    expect(html).not.toContain('View only');
  });

  // Opened from Personal while the teams request failed: the role is unknown, not "viewer".
  it('says the Organizations could not load, with Retry, instead of a silent View only', async () => {
    workspaceRoles.roles = {};
    workspaceRoles.teamsUnavailable = true;
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1' });
    workspaceRoles.teamsUnavailable = false;

    expect(html).toContain('Couldn&#x27;t load your Organizations');
    expect(html).toMatch(/>Retry</);
    expect(html).not.toContain('Continue in Personal');
    expect(html).not.toContain('View only');
    // Nothing that could fail is offered until the role is known.
    expect(html).not.toContain('Mark Complete');
    expect(html).not.toContain('Rename');
  });

  it('keeps View only, with no error, when the loaded list does not include the Organization', async () => {
    workspaceRoles.roles = {};
    const html = await renderRunPage(organizationRun(), { selectedItemId: 'item-1' });

    expect(html).toContain('View only');
    expect(html).not.toContain('Couldn&#x27;t load your Organizations');
  });

  it('shows no error on a Personal run when the teams request failed', async () => {
    workspaceRoles.roles = {};
    workspaceRoles.teamsUnavailable = true;
    const html = await renderRunPage(twoTaskRun([false, false]), { selectedItemId: 'item-1' });
    workspaceRoles.teamsUnavailable = false;

    expect(html).not.toContain('Couldn&#x27;t load your Organizations');
    expect(html).toContain('Mark Complete');
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

  it('shows the same task total in the header, the progress block and the task list', async () => {
    const html = await renderRunPage(runWithSubTasks(), { selectedItemId: 'a' });

    expect(html.match(/0 of 3 tasks finished/g)).toHaveLength(2);
    expect(html).toContain('0 / 3 tasks');
    expect(html).toContain('Task 1 of 3');
    expect(html).not.toMatch(/(of|\/) 12/);
  });

  it('fills the task list bar with the same overall progress as the header', async () => {
    const html = await renderRunPage(runWithSubTasks(), { selectedItemId: 'a' });

    // The header bar, the task list bar and the progress block's Progress (which fills to
    // its value's width).
    expect(html.match(/width:8%/g)).toHaveLength(3);
    expect(html).not.toContain('width:0%');
  });

  it('counts tasks, not sub-tasks, in the shared view', async () => {
    const html = await renderRunPage(runWithSubTasks(), { selectedItemId: 'a', shared: true });

    expect(html).toContain('0 of 3 tasks');
    expect(html).not.toMatch(/of 12/);
  });
});

describe('ChecklistRunPage task checkboxes', () => {
  const taskCheckboxes = (html: string) =>
    (html.match(/<[a-z]+[^>]*role="checkbox"[^>]*>/g) ?? []).filter((tag) => /aria-label="Mark /.test(tag));

  it('names the task checkbox and shows its state in the private view', async () => {
    const html = await renderRunPage(twoTaskRun([true, false]), { selectedItemId: 'item-1' });

    expect(taskCheckboxes(html)).toHaveLength(1);
    expect(taskCheckboxes(html)[0]).toContain('aria-label="Mark &quot;First task&quot; complete"');
    expect(taskCheckboxes(html)[0]).toContain('aria-checked="true"');
  });

  it('names every task checkbox in the shared view', async () => {
    const html = await renderRunPage(twoTaskRun([true, false]), { selectedItemId: 'item-1', shared: true });
    const [first, last] = taskCheckboxes(html);

    expect(taskCheckboxes(html)).toHaveLength(2);
    expect(first).toContain('aria-label="Mark &quot;First task&quot; complete"');
    expect(first).toContain('aria-checked="true"');
    expect(last).toContain('aria-label="Mark &quot;Last task&quot; complete"');
    expect(last).toContain('aria-checked="false"');
  });
});
