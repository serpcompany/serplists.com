import { describe, expect, it } from 'vitest';

import { refuseBlockedTask } from '../../../../src/features/run-execution/runFormAnswers';
import { mapChecklistToRun } from '../../../../src/features/run-execution/runExecutionMappers';

describe('run data handed over from JavaScript, which the declared types rule out', () => {
  it('gives a stored run with no id the id it was asked for by', () => {
    expect(mapChecklistToRun({ items: '[]' }, 'run-9').id).toBe('run-9');
    expect(mapChecklistToRun({ id: 12, items: '[]' }, 'run-12').id).toBe('run-12');
  });

  it('still refuses a task whose unfinished form field it cannot find by id, without naming the field', () => {
    const task = { id: 'task-1', title: 'Intake', contents: [{ type: 'form', value: '', fields: [{ id: 7, kind: 'text', label: 'Client name', required: true }] }] };

    expect(refuseBlockedTask(task)).toEqual({ kind: 'error', code: 'form_incomplete', message: "Finish this task's form first." });
  });
});
