import { describe, expect, it } from 'vitest';

import {
  baseRun,
  mockUseRunExecutionModel,
  renderRunPage,
  runPageModel,
  twoTaskRun,
} from '../../support/checklistRunPage';
import ChecklistRunPage from '@/views/ChecklistRun';
import type { ChecklistRun } from '@/types/checklist';

import { renderPageAt } from '../../support/nextNavigation';

const renderPrivateRunWithAnAgentInItsChangelog = () => {
  mockUseRunExecutionModel.mockReturnValue(runPageModel({
    counts: { progress: 35, subTasksCompleted: 1, subTasksTotal: 6, tasksCompleted: 1, tasksTotal: 3 },
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
    progress: 35,
    run: baseRun,
    selectedData: {
      item: baseRun.sections[0].items[0],
      section: baseRun.sections[0],
    },
    selectedItemId: 'item-1',
  }));

  return renderPageAt('/dashboard/runs/run-1', { '/dashboard/runs/[id]': <ChecklistRunPage /> });
};

describe('ChecklistRunPage layout', () => {
  it('renders the private run inside the shared dashboard shell with one persistent app sidebar and no outline of its own', async () => {
    const html = renderPrivateRunWithAnAgentInItsChangelog();

    expect(html).toContain('Progress');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('data-dashboard-page-header="true"');
    expect(html).toContain('data-run-workspace-shell="true"');
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
    expect(html).not.toContain('data-run-progress-sidebar="true"');
    expect(html).not.toContain('border-r border-border bg-card xl:flex xl:w-64');
    expect(html).not.toMatch(/<h2[^>]*>Tasks<\/h2>/);
    expect(html).not.toContain('Work through the run like a docs outline');
    expect(html).not.toContain('More options');
  });

  it('opens the task list from the mobile progress block, since the desktop panel is hidden below xl', () => {
    const html = renderPrivateRunWithAnAgentInItsChangelog();

    expect(html).toContain('data-mobile-run-progress="true"');
    expect(html).toMatch(/data-mobile-run-progress="true"(?:(?!<\/section>).)*data-mobile-run-tasks-trigger="true"/s);
  });

  it('pins the task footer to the bottom of the window, every box around it clipping, since a scroll container would hold the footer instead', () => {
    const html = renderPrivateRunWithAnAgentInItsChangelog();

    expect(html).toContain('min-h-[calc(100dvh-3.5rem)]');
    expect(html).toMatch(/class="[^"]*\bsticky bottom-0\b[^"]*" data-task-footer="true"/);
    expect(html).toMatch(/class="[^"]*\boverflow-clip\b[^"]*" data-dashboard-content-shell="true"/);
    expect(html).toMatch(/class="[^"]*\boverflow-clip\b[^"]*" data-dashboard-page-body="true"/);
    expect(html).not.toMatch(/class="[^"]*\boverflow-(auto|hidden)\b[^"]*" data-dashboard-(content-shell|page-body)="true"/);
  });

  it('renders the shared run as the public copyable checklist flow in the narrow shared page shell and its cards', async () => {
    mockUseRunExecutionModel.mockReturnValue(runPageModel({
      counts: { progress: 29, subTasksCompleted: 1, subTasksTotal: 4, tasksCompleted: 1, tasksTotal: 3 },
      isSharedRun: true,
      progress: 29,
      run: { ...baseRun, title: 'Project Setup Checklist' },
      selectedData: {
        item: baseRun.sections[0].items[0],
        section: baseRun.sections[0],
      },
      selectedItemId: 'item-1',
    }));

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
    expect(html).toContain('data-page-container="narrow"');
    expect(html).toContain('data-slot="card"');
    expect(html).not.toContain('Creating link...');
    expect(html).not.toContain('Overall Progress');
    expect(html).not.toContain('Changelog');
  });
});

describe('ChecklistRunPage task counts, which count tasks as the task list, the Task N of M badge and the runs list do, never Sub-tasks', () => {
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
  const runWithOneOfTwelveUnitsTicked = (): ChecklistRun => ({
    ...baseRun,
    progress: Math.round((1 / 12) * 100),
    sections: [
      {
        id: 'section-1',
        title: 'Pre-Launch',
        items: [taskWithSubTasks('a', 1), taskWithSubTasks('b', 0), taskWithSubTasks('c', 0)],
      },
    ],
  });

  it('shows the same task total in the header, the progress block and the task list', async () => {
    const html = await renderRunPage(runWithOneOfTwelveUnitsTicked(), { selectedItemId: 'a' });

    expect(html.match(/0 of 3 tasks finished/g)).toHaveLength(2);
    expect(html).toContain('0 / 3 tasks');
    expect(html).toContain('Task 1 of 3');
    expect(html).not.toMatch(/(of|\/) 12/);
  });

  it("fills the header bar, the task list bar and the progress block's Progress with the same overall progress", async () => {
    const html = await renderRunPage(runWithOneOfTwelveUnitsTicked(), { selectedItemId: 'a' });

    expect(html.match(/width:8%/g)).toHaveLength(3);
    expect(html).not.toContain('width:0%');
  });

  it('counts tasks, not sub-tasks, in the shared view', async () => {
    const html = await renderRunPage(runWithOneOfTwelveUnitsTicked(), { selectedItemId: 'a', shared: true });

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
