import { describe, expect, it } from 'vitest';

import { renderRunPage, twoTaskRun } from '../../support/checklistRunPage';
import type { ChecklistRun } from '@/types/checklist';

describe('ChecklistRunPage completion', () => {
  it('offers a working finish action on a fully ticked run that is still in progress', async () => {
    const html = await renderRunPage(twoTaskRun([true, true]), { selectedItemId: 'item-2' });

    expect(html).toContain('Finish Run');
    expect(html).toContain('Complete run');
    expect(html).toContain('In Progress');
  });

  it('offers the finish action in the shared run view too', async () => {
    const html = await renderRunPage(twoTaskRun([true, true]), { selectedItemId: 'item-1', shared: true });

    expect(html).toContain('Complete run');
  });

  it('points the last task at the open task instead of a dead "Finish Run"', async () => {
    const html = await renderRunPage(twoTaskRun([false, true]), { selectedItemId: 'item-2' });

    expect(html).toContain('Next unfinished task');
    expect(html).not.toContain('Finish Run');
    expect(html).not.toContain('Complete run');
  });

  it('points the last task at a ticked task with an open Sub-task, as older runs and API writes can hold, never "Run completed"', async () => {
    const run = twoTaskRun([true, true]);
    run.sections[0].items[0].contents = [
      { type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Step one', isCompleted: false }] },
    ];
    const html = await renderRunPage(run, { selectedItemId: 'item-2' });

    expect(html).toContain('In Progress');
    expect(html).toContain('Next unfinished task');
    expect(html).not.toContain('Run completed');
    expect(html).not.toContain('Complete run');
  });

  it('offers no finish action on a completed run', async () => {
    const html = await renderRunPage(twoTaskRun([true, true], 'completed'), { selectedItemId: 'item-2' });
    const sharedHtml = await renderRunPage(twoTaskRun([true, true], 'completed'), { selectedItemId: 'item-2', shared: true });

    expect(html).not.toContain('Finish Run');
    expect(html).not.toContain('Complete run');
    expect(html).toContain('Run completed');
    expect(sharedHtml).not.toContain('Complete run');
  });
});

describe('ChecklistRunPage on a completed run, which is frozen so unticking cannot leave it Completed with open tasks', () => {
  const checkboxes = (html: string) => html.match(/<[a-z]+[^>]*role="checkbox"[^>]*>/g) ?? [];
  const isDisabledOrAriaDisabled = (tag: string) => tag.includes('disabled=""') || tag.includes('aria-disabled="true"');
  const completedRun = (): ChecklistRun => {
    const run = twoTaskRun([true, true], 'completed');
    run.sections[0].items[0].contents = [
      { type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Step one', isCompleted: true }] },
    ];
    return run;
  };

  it('locks every task and sub-task checkbox in the private view and keeps notes editable', async () => {
    const html = await renderRunPage(completedRun(), { selectedItemId: 'item-1' });

    expect(html).not.toContain('Mark Complete');
    expect(checkboxes(html).length).toBeGreaterThan(0);
    expect(checkboxes(html).every(isDisabledOrAriaDisabled)).toBe(true);
    expect(html).toContain('Save notes');
  });

  it('locks them in the shared view too', async () => {
    const html = await renderRunPage(completedRun(), { selectedItemId: 'item-1', shared: true });

    expect(checkboxes(html)).toHaveLength(3);
    expect(checkboxes(html).every(isDisabledOrAriaDisabled)).toBe(true);
    expect(html).toContain('Save notes');
  });

  it('leaves the checkboxes of an in-progress run enabled', async () => {
    const html = await renderRunPage(twoTaskRun([false, false]), { selectedItemId: 'item-1', shared: true });

    expect(checkboxes(html).some(isDisabledOrAriaDisabled)).toBe(false);
  });
});

describe('ChecklistRunPage task notes', () => {
  it('shows the unsaved draft for the selected task after moving between tasks', async () => {
    const run = twoTaskRun([true, false]);
    run.sections[0].items[0].notes = 'saved note';
    const html = await renderRunPage(run, {
      noteDrafts: { 'item-1': 'Deployed build 42, see link' },
      selectedItemId: 'item-1',
    });

    expect(html).toContain('>Deployed build 42, see link</textarea>');
  });

  it('shows the drafts in the shared run view too', async () => {
    const html = await renderRunPage(twoTaskRun([false, false]), {
      noteDrafts: { 'item-2': 'Guest note in progress' },
      selectedItemId: 'item-1',
      shared: true,
    });

    expect(html).toContain('>Guest note in progress</textarea>');
  });
});
