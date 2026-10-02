import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...(await import('../../../support/hookStateSlots')).hooksKeptBetweenRenders,
}));

import { MobileRunProgress } from '@/components/run-execution/MobileRunProgress';
import { Sheet } from '@/components/ui/sheet';

import { findElement } from '../../../support/elementTree';
import { forgetKeptState, renderKeepingState, unmountEffects } from '../../../support/hookStateSlots';

const createMediaQuery = () => {
  const listeners = new Set<() => void>();
  return {
    matches: false,
    listeners,
    addEventListener: (_type: 'change', listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: () => void) => listeners.delete(listener),
  };
};

let taskColumn: ReturnType<typeof createMediaQuery>;

const renderTaskSheet = () => {
  const tree = renderKeepingState(() =>
    MobileRunProgress({
      completedTasks: 1,
      currentSectionId: 'section-1',
      currentTaskId: 'task-1',
      onSelectTask: vi.fn(),
      position: { index: 0, total: 2 },
      progress: 50,
      sections: [{ id: 'section-1', title: 'Setup', items: [{ id: 'task-1', title: 'First' }] }],
      totalTasks: 2,
    }),
  );
  const sheet = findElement(tree, (element) => element.type === Sheet);
  expect(sheet).not.toBeNull();
  return sheet!;
};

const openTaskSheet = () => {
  (renderTaskSheet().props.onOpenChange as (open: boolean) => void)(true);
  expect(renderTaskSheet().props.open).toBe(true);
};

beforeEach(() => {
  forgetKeptState();
  taskColumn = createMediaQuery();
  vi.stubGlobal('window', { matchMedia: () => taskColumn });
});

afterEach(() => {
  unmountEffects();
  forgetKeptState();
  vi.unstubAllGlobals();
});

describe('MobileRunProgress task sheet', () => {
  it('stays open while the window stays below xl', () => {
    openTaskSheet();
    taskColumn.listeners.forEach((listener) => listener());

    expect(renderTaskSheet().props.open).toBe(true);
  });

  it('closes when the window grows to xl, where the task column shows and the sheet would sit over it', () => {
    openTaskSheet();

    taskColumn.matches = true;
    taskColumn.listeners.forEach((listener) => listener());

    expect(renderTaskSheet().props.open).toBe(false);
  });

  it('stops listening once the sheet closes', () => {
    openTaskSheet();
    (renderTaskSheet().props.onOpenChange as (open: boolean) => void)(false);
    renderTaskSheet();

    expect(taskColumn.listeners.size).toBe(0);
  });
});
