import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...(await import('../../../support/hookStateSlots')).hooksKeptBetweenRenders,
}));

import { useOutlineDrag, type OutlineDragState } from '@/components/template-editor/useOutlineDrag';

import { forgetKeptState, renderKeepingState } from '../../../support/hookStateSlots';

const moves = { moveSection: vi.fn(), moveTask: vi.fn() };

const outline = () => renderKeepingState(() => useOutlineDrag(moves));

const dragEvent = () => ({
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  dataTransfer: { setData: vi.fn(), effectAllowed: '', dropEffect: '' },
});

type DragHandler = (event: unknown, ...indexes: number[]) => void;

const startDragging = (drag: OutlineDragState) => {
  const start = dragEvent();
  (outline().startDrag as (event: unknown, drag: OutlineDragState) => void)(start, drag);
  return start;
};

const dragOverTask = (sectionIndex: number, itemIndex: number) => {
  const over = dragEvent();
  (outline().handleTaskDragOver as DragHandler)(over, sectionIndex, itemIndex);
  return over;
};

const dropOnTask = (sectionIndex: number, itemIndex: number) =>
  (outline().handleTaskDrop as DragHandler)(dragEvent(), sectionIndex, itemIndex);

const dropOnSection = (sectionIndex: number) =>
  (outline().handleSectionDrop as DragHandler)(dragEvent(), sectionIndex);

beforeEach(() => {
  forgetKeptState();
  vi.clearAllMocks();
});

afterEach(() => {
  forgetKeptState();
});

describe("the template editor outline's drag and drop", () => {
  it('puts the dragged entry in the drag data as the drag starts, since Firefox starts no drag without data', () => {
    const start = startDragging({ kind: 'section', sectionIndex: 1 });

    expect(start.dataTransfer.setData).toHaveBeenCalledTimes(1);
  });

  it('moves a task within its own section', () => {
    startDragging({ kind: 'task', sectionIndex: 0, itemIndex: 2 });

    expect(dragOverTask(0, 0).preventDefault).toHaveBeenCalled();
    dropOnTask(0, 0);

    expect(moves.moveTask).toHaveBeenCalledWith(0, 2, 0);
  });

  it("refuses a task dropped on another section's task, since a task moves only within its section", () => {
    startDragging({ kind: 'task', sectionIndex: 0, itemIndex: 2 });

    expect(dragOverTask(1, 0).preventDefault).not.toHaveBeenCalled();
    dropOnTask(1, 0);

    expect(moves.moveTask).not.toHaveBeenCalled();
  });

  it('moves a section among the sections, and never drops a task or a section on the other kind', () => {
    startDragging({ kind: 'task', sectionIndex: 0, itemIndex: 1 });
    dropOnSection(2);
    startDragging({ kind: 'section', sectionIndex: 0 });
    dropOnTask(0, 1);
    expect(moves.moveSection).not.toHaveBeenCalled();
    expect(moves.moveTask).not.toHaveBeenCalled();

    startDragging({ kind: 'section', sectionIndex: 0 });
    dropOnSection(2);

    expect(moves.moveSection).toHaveBeenCalledWith(0, 2);
  });

  it('ignores a drop from a drag that did not start on one of its handles', () => {
    dropOnTask(0, 0);
    dropOnSection(1);

    expect(moves.moveTask).not.toHaveBeenCalled();
    expect(moves.moveSection).not.toHaveBeenCalled();
  });
});
