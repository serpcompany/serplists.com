import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SharedRunView } from '@/components/run-execution/SharedRunView';
import type { ChecklistFormField, ChecklistItem, ChecklistRun } from '@/types/checklist';

import { getByAccessibleName } from '../accessibleMarkup';

vi.mock('next/navigation', async () => (await import('../../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../../support/nextNavigation')).nextLinkMock);

const NAME: ChecklistFormField = { id: 'field-name', label: 'Client name', kind: 'text', required: true };

const formTask = (id: string, title: string, fields: ChecklistFormField[], isCompleted = false): ChecklistItem => ({
  id,
  title,
  isCompleted,
  contents: [{ id: `${id}-form`, type: 'form', value: '', fields }],
});

const renderSharedRun = (items: ChecklistItem[], status: ChecklistRun['status'] = 'in_progress') => {
  const run: ChecklistRun = {
    id: 'run-1',
    templateId: 'template-1',
    title: 'New client',
    status,
    progress: 0,
    sections: [{ id: 'section-1', title: 'Intake', items }],
    startedAt: '2026-10-05T08:00:00.000Z',
    userId: 'user-1',
  };
  return renderToStaticMarkup(
    <SharedRunView
      completedTasks={0}
      finishRunButton={null}
      isRunCompleted={status === 'completed'}
      noteDrafts={{}}
      onCopyLink={vi.fn()}
      onNoteDraftChange={vi.fn()}
      onSaveNotes={vi.fn(async () => true)}
      onToggleSubItem={vi.fn()}
      onToggleTask={vi.fn()}
      progress={0}
      run={run}
      sectionProgress={[{ completed: 0, index: 0, section: { id: 'section-1', title: 'Intake', items }, total: items.length }]}
      totalTasks={items.length}
    />,
  );
};

const NOTE = 'This task can be ticked once its form is answered.';

describe('a form on the shared run page', () => {
  it("shows the answers read-only, with no input to change them", () => {
    const html = renderSharedRun([formTask('task-answered', 'Collect details', [{ ...NAME, answer: 'Acme' }])]);

    expect(html).toContain('Answer: </span>Acme');
    expect(html).not.toMatch(/<input\b[^>]*type="(text|url|email|number|date|file)"/);
    expect(getByAccessibleName(html, 'Client name')).toBeUndefined();
  });

  it("keeps a task whose form blocks it from being ticked, and says why", () => {
    const html = renderSharedRun([
      formTask('task-blocked', 'Collect details', [NAME]),
      formTask('task-answered', 'Confirm the plan', [{ ...NAME, answer: 'Acme' }]),
    ]);

    const blocked = getByAccessibleName(html, 'Mark "Collect details" complete');
    const answered = getByAccessibleName(html, 'Mark "Confirm the plan" complete');
    expect(blocked?.attrs['aria-disabled']).toBe('true');
    expect(html).toContain(NOTE);
    expect(answered?.attrs['aria-disabled']).toBeUndefined();
    expect(html.split(NOTE)).toHaveLength(2);
  });

  it('leaves a ticked task free to be unticked, and says nothing once the run is completed', () => {
    expect(renderSharedRun([formTask('task-ticked', 'Collect details', [NAME], true)])).not.toContain(NOTE);
    expect(renderSharedRun([formTask('task-blocked', 'Collect details', [NAME])], 'completed')).not.toContain(NOTE);
  });
});
