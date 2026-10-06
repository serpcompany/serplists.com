import { describe, expect, it, vi } from 'vitest';

import { TaskExecutionPanel } from '@/components/run-execution/TaskExecutionPanel';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import type { ChecklistItem, FormAnswer } from '@/types/checklist';

import { present } from '../../../support/elements';
import { findElementOf, handlerOf } from '../../../support/elementTree';

const task: ChecklistItem = {
  id: 'task-1',
  title: 'Collect details',
  isCompleted: false,
  contents: [{ id: 'form-1', type: 'form', value: '', fields: [{ id: 'field-name', label: 'Client name', kind: 'text', required: true }] }],
};

const rendererIn = (extra: Partial<Parameters<typeof TaskExecutionPanel>[0]>) => {
  const onFormAnswerChange = vi.fn<(fieldId: string, answer: FormAnswer | undefined) => void>();
  const tree = TaskExecutionPanel({
    hasNext: false,
    hasPrev: false,
    onFinishRun: vi.fn(),
    onFormAnswerChange,
    onNavigateNext: vi.fn(),
    onNavigatePrev: vi.fn(),
    onNotesDraftChange: vi.fn(),
    onSaveNotes: vi.fn(async () => true),
    onSelectTask: vi.fn(),
    onToggleSubItem: vi.fn(),
    onToggleTask: vi.fn(),
    primaryAction: { kind: 'complete_task' },
    section: { id: 'section-1', title: 'Intake', items: [task] },
    sectionIndex: 0,
    task,
    taskIndex: 0,
    totalTasks: 1,
    ...extra,
  });
  return { onFormAnswerChange, renderer: present(findElementOf(tree, ContentRenderer), 'the task content') };
};

describe("the task panel and a task's form", () => {
  it('passes each answer on by field id, with the refused attempts and where to log in to upload', () => {
    const { onFormAnswerChange, renderer } = rendererIn({ formCheck: 2, uploadLoginPath: '/login/?next=%2Frun%2F' });

    handlerOf(renderer, 'onFormAnswerChange')(0, 'field-name', 'Acme');

    expect(onFormAnswerChange).toHaveBeenCalledWith('field-name', 'Acme');
    expect(renderer.props.formCheck).toBe(2);
    expect(renderer.props.uploadLoginPath).toBe('/login/?next=%2Frun%2F');
  });

  it('offers no inputs on a completed run, whose answers are frozen, or to a role that cannot change the run', () => {
    expect(rendererIn({ runCompleted: true }).renderer.props.onFormAnswerChange).toBeUndefined();
    expect(rendererIn({ readOnly: true }).renderer.props.onFormAnswerChange).toBeUndefined();
  });
});
