import { describe, expect, it } from 'vitest';

import { carryGuestRunProgress } from '@/features/guest-runs/guestRunProgress';
import type { ChecklistFormField, ChecklistItem, ChecklistRun } from '@/types/checklist';

import { contentAt, taskAt } from '../../../support/elements';

const run = (items: ChecklistItem[], extra: Partial<ChecklistRun> = {}): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-intake',
  title: 'New client',
  status: 'in_progress',
  progress: 0,
  sections: [{ id: 'section-intake', title: 'Intake', items }],
  startedAt: '2026-10-05T08:00:00.000Z',
  userId: '',
  revision: 1,
  ...extra,
});

const formTask = (fields: ChecklistFormField[], isCompleted = false): ChecklistItem => ({
  id: 'task-details',
  title: 'Collect details',
  isCompleted,
  contents: [{ id: 'form-1', type: 'form', value: '', fields }],
});

const NAME: ChecklistFormField = { id: 'field-name', label: 'Client name', kind: 'text', required: true };
const SEATS: ChecklistFormField = { id: 'field-seats', label: 'Seats', kind: 'number', required: false };

describe("carrying a guest run's form answers onto the account's new run", () => {
  it('copies each answer by field id, whatever order the fields are in now, and keeps the task done', () => {
    const guest = run([formTask([{ ...NAME, answer: 'Acme' }, { ...SEATS, answer: 4 }], true)], {
      status: 'completed',
      completedAt: '2026-10-05T09:00:00.000Z',
    });
    const created = run([formTask([SEATS, NAME])], { id: 'run-9', userId: 'user-1' });

    const carried = carryGuestRunProgress(created, guest);

    expect(contentAt(taskAt(carried, 0, 0), 0).fields).toEqual([{ ...SEATS, answer: 4 }, { ...NAME, answer: 'Acme' }]);
    expect(taskAt(carried, 0, 0).isCompleted).toBe(true);
    expect(carried).toMatchObject({ status: 'completed', completedAt: '2026-10-05T09:00:00.000Z' });
  });

  it('leaves out an answer whose field changed kind since, as the run would', () => {
    const guest = run([formTask([{ ...NAME, answer: 'Acme' }, { ...SEATS, answer: 4 }])]);
    const created = run([formTask([NAME, { ...SEATS, kind: 'text' }])]);

    const fields = contentAt(taskAt(carryGuestRunProgress(created, guest), 0, 0), 0).fields;

    expect(fields?.[0]?.answer).toBe('Acme');
    expect(fields?.[1]?.answer).toBeUndefined();
  });

  it('does not carry a task as done when its form now blocks it, and so does not complete the run', () => {
    const guest = run([formTask([{ ...SEATS, answer: 4 }], true)], { status: 'completed', completedAt: '2026-10-05T09:00:00.000Z' });
    const created = run([formTask([NAME, SEATS])]);

    const carried = carryGuestRunProgress(created, guest);

    expect(taskAt(carried, 0, 0).isCompleted).toBe(false);
    expect(contentAt(taskAt(carried, 0, 0), 0).fields?.[1]?.answer).toBe(4);
    expect(carried).toMatchObject({ status: 'in_progress', completedAt: undefined });
  });
});
