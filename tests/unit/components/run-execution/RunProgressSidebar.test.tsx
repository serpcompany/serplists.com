import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { MobileRunProgress } from '@/components/run-execution/MobileRunProgress';
import { RunProgressPanel, RunTaskList } from '@/components/run-execution/RunProgressSidebar';
import type { ChecklistSection } from '@/types/checklist';

import { findAllElements } from '../../../support/elementTree';

const sections: ChecklistSection[] = [
  {
    id: 'setup',
    title: 'Setup',
    items: [
      { id: 't1', title: 'Create the account', isCompleted: true },
      { id: 't2', title: 'Invite the Organization', isCompleted: false },
    ],
  },
  {
    id: 'launch',
    title: 'Launch',
    items: [{ id: 't3', title: 'Publish the page', isCompleted: false }],
  },
];

describe('RunTaskList', () => {
  const list = (currentTaskId: string | null, onSelectTask = vi.fn()) =>
    RunTaskList({ currentSectionId: 'setup', currentTaskId, label: 'Run tasks', onSelectTask, progress: 33, sections });

  it('lists every task at any width, marking the current and finished ones', () => {
    const html = renderToStaticMarkup(list('t2'));

    for (const title of ['Create the account', 'Invite the Organization', 'Publish the page']) {
      expect(html).toContain(title);
    }
    expect(html).not.toMatch(/class="(?:[^"]*\s)?hidden(?:\s[^"]*)?"/);
    expect(html).toContain('aria-label="Run tasks"');
    expect(html).toMatch(/aria-current="step"[^>]*>(?:(?!<\/button>).)*Invite the Organization/s);
    expect(html.match(/aria-current=/g)).toHaveLength(1);
    expect(html).toMatch(/Create the account(?:(?!<\/button>).)*<span class="sr-only">\(completed\)<\/span>/s);
    expect(html.match(/\(completed\)/g)).toHaveLength(1);
    expect(html).toContain('1 / 3 tasks');
  });

  it('selects the clicked task', () => {
    const onSelectTask = vi.fn();
    const rows = findAllElements(list(null, onSelectTask), (element) => element.type === 'button');

    expect(rows).toHaveLength(3);
    (rows[2]?.props.onClick as () => void)();
    expect(onSelectTask).toHaveBeenCalledWith('launch', 't3');
  });

  it("fills the bar with the run's overall progress it is given, in which sub-tasks weigh as in the header, and counts tasks, not sub-tasks", () => {
    const withSubTasks: ChecklistSection[] = [
      {
        id: 'setup',
        title: 'Setup',
        items: [
          {
            id: 't1',
            title: 'Create the account',
            isCompleted: false,
            contents: [
              { type: 'subItems', value: '', subItems: [{ id: 's1', title: 'Pick a name', isCompleted: true }] },
            ],
          },
          { id: 't2', title: 'Invite the Organization', isCompleted: false },
        ],
      },
    ];
    const html = renderToStaticMarkup(
      RunTaskList({ currentSectionId: 'setup', currentTaskId: 't1', label: 'Run tasks', onSelectTask: vi.fn(), progress: 33, sections: withSubTasks }),
    );

    expect(html).toContain('0 / 2 tasks');
    expect(html).toContain('0/2');
    expect(html).toContain('width:33%');
  });

  it('shows an empty state for a run with no tasks', () => {
    const html = renderToStaticMarkup(
      RunTaskList({ currentSectionId: null, currentTaskId: null, label: 'Run tasks', onSelectTask: vi.fn(), progress: 0, sections: [] }),
    );
    expect(html).toContain('This run has no tasks.');
  });
});

describe('RunProgressPanel', () => {
  it('stays the desktop column only', () => {
    const html = renderToStaticMarkup(
      <RunProgressPanel currentSectionId="setup" currentTaskId="t2" onSelectTask={vi.fn()} progress={33} sections={sections} />,
    );
    expect(html).toMatch(/<section class="hidden [^"]*xl:flex"[^>]*data-run-progress-panel="true"/);
    expect(html).toContain('Invite the Organization');
  });
});

describe('MobileRunProgress', () => {
  it('offers a Tasks button that opens the task list below the desktop breakpoint', () => {
    const html = renderToStaticMarkup(
      <MobileRunProgress
        completedTasks={1}
        currentSectionId="setup"
        currentTaskId="t2"
        onSelectTask={vi.fn()}
        position={{ index: 1, total: 3 }}
        progress={33}
        sections={sections}
        totalTasks={3}
      />,
    );

    expect(html).toMatch(/<section class="[^"]*xl:hidden[^"]*"[^>]*data-mobile-run-progress="true"/);
    const trigger = html.match(/<button[^>]*data-mobile-run-tasks-trigger="true"[^>]*>(?:(?!<\/button>).)*<\/button>/s)?.[0];
    expect(trigger).toContain('aria-haspopup="dialog"');
    expect(trigger).toMatch(/>Tasks<\/button>$/);
    expect(html).toContain('Task 2 of 3');
    expect(html).toContain('1 of 3 tasks finished');
  });
});
