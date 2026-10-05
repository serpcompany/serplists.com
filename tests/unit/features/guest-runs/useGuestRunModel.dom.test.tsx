import { navigation } from '../../../support/mockedNextNavigation';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readGuestRun, removeGuestRun, saveGuestRun, startGuestRun } from '@/features/guest-runs/guestRunStore';
import { useGuestRunModel } from '@/features/guest-runs/useGuestRunModel';
import { RUN_CHANGED_ELSEWHERE_MESSAGE } from '@/features/run-execution/runSaver';
import type { RunExecutionActionResult } from '@/features/run-execution/useRunExecutionModel';
import type { ChecklistItem, ChecklistRun } from '@/types/checklist';

import { contentAt, present, subTaskAt, taskAt } from '../../../support/elements';
import { guestRunTemplate } from '../../../support/guestRuns';
import { mountQueryHook, settle } from '../../../support/queryHookProbe';
import { theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();

const unmounts: Array<() => void> = [];

beforeEach(() => {
  navigation.reset('/profile/alice/weekend-camping/run/');
});

afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

async function openTheGuestRun() {
  const page = await mountQueryHook(() => useGuestRunModel(guestRunTemplate.id));
  unmounts.push(page.unmount);
  await act(settle);
  return page.current;
}

const storedRun = (): ChecklistRun => present(readGuestRun(guestRunTemplate.id), 'the stored guest run');

async function openTheGuestRunThatAnotherTabThenChanges(lastTaskChange: Partial<ChecklistItem>) {
  const started = startGuestRun(guestRunTemplate, 'Lake trip');
  const model = await openTheGuestRun();
  const [firstSection, ...laterSections] = started.sections;
  saveGuestRun({
    ...started,
    sections: [
      present(firstSection, 'the first section'),
      ...laterSections.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, ...lastTaskChange })) })),
    ],
  });
  return model;
}

const subTaskTicks = (run: ChecklistRun) => contentAt(taskAt(run, 0, 0), 0).subItems?.map((subItem) => subItem.isCompleted);

describe("a guest run's page model, which keeps the run in this browser", () => {
  it("opens the run kept for the Template on its first unfinished task, and finds none for a Template without one", async () => {
    startGuestRun(guestRunTemplate, 'Lake trip');

    const model = await openTheGuestRun();

    expect(model()).toMatchObject({ isSharedRun: false, loading: false, mode: 'guest', notFound: false, selectedItemId: 'task-tent' });
    expect(model().run?.title).toBe('Lake trip');
    expect(model().history.isLoading).toBe(false);

    removeGuestRun(guestRunTemplate.id);
    const another = await openTheGuestRun();
    expect(another()).toMatchObject({ loading: false, notFound: true, run: null });
  });

  it('keeps ticks, Sub-task ticks and notes, which a reload of the page reads back', async () => {
    startGuestRun(guestRunTemplate, 'Lake trip');
    const model = await openTheGuestRun();

    await act(async () => {
      await model().toggleItem('task-food', true);
      await model().toggleSubItem('task-tent', 0, 0, true);
      await model().saveItemNotes('task-lock', 'Spare key with the neighbours');
    });

    expect(taskAt(storedRun(), 0, 1).isCompleted).toBe(true);
    expect(subTaskTicks(storedRun())).toEqual([true, false]);
    expect(taskAt(storedRun(), 1, 0).notes).toBe('Spare key with the neighbours');

    const reloaded = await openTheGuestRun();
    expect(reloaded().run?.sections).toEqual(storedRun().sections);
    expect(reloaded().counts).toMatchObject({ subTasksCompleted: 1, tasksCompleted: 1 });
  });

  it('completes a task once its last open Sub-task is ticked, and Mark Complete ticks every Sub-task, as on any run', async () => {
    startGuestRun(guestRunTemplate, 'Lake trip');
    const model = await openTheGuestRun();

    await act(async () => {
      await model().toggleSubItem('task-tent', 0, 0, true);
      await model().toggleSubItem('task-tent', 0, 1, true);
    });
    expect(taskAt(storedRun(), 0, 0).isCompleted).toBe(true);

    await act(async () => {
      await model().toggleItem('task-tent', false);
      await model().toggleItem('task-tent', true);
    });
    expect(subTaskTicks(storedRun())).toEqual([true, true]);
  });

  it('completes the run once every task is done and freezes its tasks', async () => {
    startGuestRun(guestRunTemplate, 'Lake trip');
    const model = await openTheGuestRun();

    let promptedAfterLastTick = false;
    await act(async () => {
      await model().toggleItem('task-tent', true);
      await model().toggleItem('task-food', true);
      const last = await model().toggleItem('task-lock', true);
      promptedAfterLastTick = last.kind === 'ok' && last.shouldPromptComplete === true;
      await model().completeRun();
    });

    expect(promptedAfterLastTick).toBe(true);
    expect(storedRun()).toMatchObject({ progress: 100, status: 'completed' });
    expect(storedRun().completedAt).toEqual(expect.any(String));
    let untick: RunExecutionActionResult | undefined;
    await act(async () => {
      untick = await model().toggleItem('task-lock', false);
    });
    expect(untick?.kind).toBe('error');
    expect(taskAt(storedRun(), 1, 0).isCompleted).toBe(true);
  });

  it('applies a tick on top of what another tab saved first, keeping that tab’s progress', async () => {
    const model = await openTheGuestRunThatAnotherTabThenChanges({ isCompleted: true });

    await act(async () => {
      await model().toggleItem('task-food', true);
    });

    expect(taskAt(storedRun(), 0, 1).isCompleted).toBe(true);
    expect(taskAt(storedRun(), 1, 0).isCompleted).toBe(true);
    expect(model().run?.revision).toBe(storedRun().revision);
  });

  it('keeps notes typed here when another tab saved different notes for that task first, and says so', async () => {
    const model = await openTheGuestRunThatAnotherTabThenChanges({ notes: 'From the other tab' });

    let saved: RunExecutionActionResult | undefined;
    await act(async () => {
      model().setNoteDraft('task-lock', 'From this tab');
      saved = await model().saveItemNotes('task-lock', 'From this tab');
    });

    expect(saved).toEqual({ kind: 'error', message: RUN_CHANGED_ELSEWHERE_MESSAGE });
    expect(taskAt(storedRun(), 1, 0).notes).toBe('From the other tab');
    expect(model().noteDrafts).toEqual({ 'task-lock': 'From this tab' });
  });

  it('finds the run gone when another tab deleted it, or replaced it with a new run, before a save', async () => {
    startGuestRun(guestRunTemplate, 'Lake trip');
    const model = await openTheGuestRun();
    removeGuestRun(guestRunTemplate.id);
    startGuestRun(guestRunTemplate, 'A new trip');

    await act(async () => {
      await model().toggleItem('task-food', true);
    });

    expect(model().notFound).toBe(true);
    expect(storedRun().title).toBe('A new trip');
    expect(subTaskAt(contentAt(taskAt(storedRun(), 0, 0), 0), 0).isCompleted).toBe(false);
    expect(taskAt(storedRun(), 0, 1).isCompleted).toBe(false);
  });
});
