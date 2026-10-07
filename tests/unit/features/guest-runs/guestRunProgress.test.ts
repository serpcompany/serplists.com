import { describe, expect, it } from 'vitest';

import { carryGuestRunProgress } from '@/features/guest-runs/guestRunProgress';
import type { ChecklistItem, ChecklistRun } from '@/types/checklist';

import { contentAt, subTaskAt, taskAt } from '../../../support/elements';

const run = (items: ChecklistItem[], extra: Partial<ChecklistRun> = {}): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-camping',
  title: 'Lake trip',
  status: 'in_progress',
  progress: 0,
  sections: [{ id: 'section-pack', title: 'Pack', items }],
  startedAt: '2026-10-05T08:00:00.000Z',
  userId: 'user-1',
  revision: 1,
  ...extra,
});

const tent = (subItems: NonNullable<ChecklistItem['contents']>[number]['subItems'], isCompleted = false): ChecklistItem => ({
  id: 'task-tent',
  title: 'Pack the tent',
  isCompleted,
  contents: [{ id: 'block-tent', type: 'subItems', value: '', subItems }],
});

const unticked = [
  { id: 'sub-poles', title: 'Poles', isCompleted: false },
  { id: 'sub-stakes', title: 'Stakes', isCompleted: false },
];

describe("carrying a guest run's progress onto the account's new run", () => {
  it('copies ticks and notes task by task, by id, whatever order the new run holds them in', () => {
    const guest = run([
      { id: 'task-food', title: 'Pack the food', isCompleted: true, notes: 'Bought on Friday' },
      { id: 'task-lock', title: 'Lock the house', isCompleted: false, notes: 'Spare key with the neighbours' },
    ]);
    const created = run([
      { id: 'task-lock', title: 'Lock the house', isCompleted: false },
      { id: 'task-food', title: 'Pack the food', isCompleted: false },
    ], { id: 'run-9', userId: 'user-1' });

    const carried = carryGuestRunProgress(created, guest);

    expect(carried).toMatchObject({ id: 'run-9', revision: 1, status: 'in_progress' });
    expect(taskAt(carried, 0, 0)).toMatchObject({ id: 'task-lock', isCompleted: false, notes: 'Spare key with the neighbours' });
    expect(taskAt(carried, 0, 1)).toMatchObject({ id: 'task-food', isCompleted: true, notes: 'Bought on Friday' });
  });

  it('finds a Sub-task by its id even when it moved, and by its place when it has none', () => {
    const guest = run([
      tent([
        { id: 'sub-stakes', title: 'Stakes', isCompleted: true },
        { id: 'sub-poles', title: 'Poles', isCompleted: false },
        { title: 'Mallet', isCompleted: true },
      ]),
    ]);
    const created = run([tent([...unticked, { title: 'Mallet', isCompleted: false }])]);

    const block = contentAt(taskAt(carryGuestRunProgress(created, guest), 0, 0), 0);

    expect(subTaskAt(block, 0)).toMatchObject({ id: 'sub-poles', isCompleted: false });
    expect(subTaskAt(block, 1)).toMatchObject({ id: 'sub-stakes', isCompleted: true });
    expect(subTaskAt(block, 2)).toMatchObject({ title: 'Mallet', isCompleted: true });
  });

  it('keeps a task with Sub-tasks done exactly when all of them are, so a Sub-task the guest run never had reopens it', () => {
    const guest = run([tent([{ id: 'sub-poles', title: 'Poles', isCompleted: true }], true)]);
    const created = run([tent(unticked)]);

    const carriedTent = taskAt(carryGuestRunProgress(created, guest), 0, 0);

    expect(carriedTent.isCompleted).toBe(false);
    expect(contentAt(carriedTent, 0).subItems?.map((subItem) => subItem.isCompleted)).toEqual([true, false]);
  });

  it('leaves a task the guest run never had unticked, and drops work the new run no longer holds', () => {
    const guest = run([{ id: 'task-gone', title: 'Removed from the Template', isCompleted: true, notes: 'Old notes' }]);
    const created = run([{ id: 'task-food', title: 'Pack the food', isCompleted: false }]);

    const carried = carryGuestRunProgress(created, guest);

    expect(carried.sections.flatMap((section) => section.items)).toEqual([
      { id: 'task-food', title: 'Pack the food', isCompleted: false },
    ]);
  });

  it('completes the new run when the guest run was completed and every task carried over done, keeping its completion time', () => {
    const completedAt = '2026-10-05T10:00:00.000Z';
    const guest = run([{ id: 'task-food', title: 'Pack the food', isCompleted: true }], { completedAt, status: 'completed' });

    expect(carryGuestRunProgress(run([{ id: 'task-food', title: 'Pack the food' }]), guest)).toMatchObject({
      completedAt,
      status: 'completed',
    });
  });

  it('keeps the new run in progress when the Template has gained a task since the guest run was completed', () => {
    const guest = run([{ id: 'task-food', title: 'Pack the food', isCompleted: true }], {
      completedAt: '2026-10-05T10:00:00.000Z',
      status: 'completed',
    });
    const created = run([
      { id: 'task-food', title: 'Pack the food' },
      { id: 'task-new', title: 'Added later' },
    ]);

    const carried = carryGuestRunProgress(created, guest);

    expect(carried.status).toBe('in_progress');
    expect(carried.completedAt).toBeUndefined();
  });
});
