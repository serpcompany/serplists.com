import '../../../support/sectionSidebarHooks';
import React from 'react';
import { get } from 'react-hook-form';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { SectionSidebar } from '@/components/template-editor/SectionSidebar';
import { Input } from '@/components/ui/input';

import { createFormControlMountedLikeUseForm } from '../../../support/editorFormControl';
import { findAllElements, findDomElement, withComponentsRenderedOneLevel } from '../../../support/elementTree';
import { forgetKeptState, renderKeepingState } from '../../../support/hookStateSlots';

const harness = vi.hoisted(() => ({
  form: null as unknown as ReturnType<typeof import('react-hook-form').createFormControl>,
  setValue: null as unknown as (...args: unknown[]) => void,
}));

vi.mock('react-hook-form', async (importOriginal) =>
  (await import('../../../support/reactHookFormMock')).reactHookFormWatching(
    importOriginal,
    harness,
    ({ valueAt }) => ({
      useFormContext: () => ({
        control: {},
        getValues: (name?: string) =>
          name ? valueAt(name) : harness.form.getValues(),
        setValue: harness.setValue,
      }),
      useFieldArray: ({ name }: { name: string }) => {
        const values = (valueAt(name) ?? []) as Array<{ id: string }>;
        return {
          fields: values.map((value) => ({ ...value, fieldId: `field-${value.id}` })),
          append: vi.fn(),
          remove: vi.fn(),
          move: (from: number, to: number) => {
            const next = [...values];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            harness.form.setValue(name as 'sections', next as never, { shouldDirty: true });
          },
        };
      },
    }),
  ),
);

const selection = {
  onSelectSection: vi.fn(),
  onSelectItem: vi.fn(),
};

function createForm(): void {
  harness.form = createFormControlMountedLikeUseForm({
    sections: [
      {
        id: 's1',
        title: 'First section',
        items: [
          { id: 'a', title: 'Task A', contents: [] },
          { id: 'b', title: 'Task B', contents: [] },
        ],
      },
      { id: 's2', title: 'Second section', items: [{ id: 'c', title: 'Task C', contents: [] }] },
    ],
  }) as unknown as typeof harness.form;
  const setValue = harness.form.setValue as (...args: unknown[]) => void;
  harness.setValue = vi.fn((...args: unknown[]) => setValue(...args));
}

function render(props: { selectedSectionIndex?: number; selectedItemIndex?: number | null } = {}): React.ReactNode {
  return renderKeepingState(() =>
    SectionSidebar({
      outlineSelectionActive: true,
      selectedSectionIndex: props.selectedSectionIndex ?? 0,
      selectedItemIndex: props.selectedItemIndex ?? null,
      ...selection,
    }),
  );
}

const findDomElementNamed = (tree: React.ReactNode, name: string) =>
  findDomElement(tree, (element) => element.props['aria-label'] === name);

function pressOnHandle(tree: React.ReactNode, name: string, key: string) {
  const handle = findDomElementNamed(tree, name);
  assert.exists(handle);
  const event = {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
  };
  const onKeyDown = handle.props.onKeyDown as ((event: unknown) => void) | undefined;
  expect(onKeyDown).toBeTypeOf('function');
  onKeyDown?.(event);
  return event;
}

const sectionTitles = () =>
  (harness.form.getValues('sections') as Array<{ title: string }>).map((section) => section.title);
const taskIds = (sectionIndex: number) =>
  (get(harness.form.getValues(), `sections.${sectionIndex}.items`) as Array<{ id: string }>).map((item) => item.id);

function liveRegionText(tree: React.ReactNode): string {
  const region = findDomElement(tree, (element) => element.props['aria-live'] === 'polite');
  return region ? String(region.props.children ?? '') : '';
}

describe('SectionSidebar keyboard reordering', () => {
  beforeEach(() => {
    forgetKeptState();
    vi.clearAllMocks();
    createForm();
  });

  it('moves a section up with the arrow key on its handle and keeps the selection on it', () => {
    const event = pressOnHandle(render({ selectedSectionIndex: 1 }), 'Drag Second section', 'ArrowUp');

    expect(event.preventDefault).toHaveBeenCalled();
    expect(sectionTitles()).toEqual(['Second section', 'First section']);
    expect((harness.form.getValues('sections') as Array<{ id: string }>).map((section) => section.id)).toEqual(['s2', 's1']);
    expect(selection.onSelectSection).toHaveBeenCalledWith(0);
    expect(liveRegionText(render())).toBe('Moved Second section to position 1 of 2');
  });

  it('moves a task down within its section and marks the form dirty', () => {
    const event = pressOnHandle(render({ selectedSectionIndex: 0, selectedItemIndex: 0 }), 'Drag Task A', 'ArrowDown');

    expect(event.preventDefault).toHaveBeenCalled();
    expect(taskIds(0)).toEqual(['b', 'a']);
    expect(harness.setValue).toHaveBeenCalledWith(
      'sections.0.items',
      expect.any(Array),
      expect.objectContaining({ shouldDirty: true }),
    );
    expect(selection.onSelectItem).toHaveBeenCalledWith(0, 1);
    expect(liveRegionText(render())).toBe('Moved Task A to position 2 of 2');
  });

  it('does nothing past either end, without scrolling the outline', () => {
    const up = pressOnHandle(render(), 'Drag First section', 'ArrowUp');
    const down = pressOnHandle(render(), 'Drag Task B', 'ArrowDown');

    expect(up.preventDefault).toHaveBeenCalled();
    expect(down.preventDefault).toHaveBeenCalled();
    expect(sectionTitles()).toEqual(['First section', 'Second section']);
    expect(taskIds(0)).toEqual(['a', 'b']);
    expect(harness.setValue).not.toHaveBeenCalled();
  });

  it('leaves other keys alone', () => {
    const event = pressOnHandle(render(), 'Drag Second section', 'Tab');

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(sectionTitles()).toEqual(['First section', 'Second section']);
  });

  it('points every handle at the keyboard hint', () => {
    const rendered = withComponentsRenderedOneLevel(render());
    const handles = findAllElements(
      rendered,
      (element) => typeof element.type === 'string' && /^Drag /.test(String(element.props['aria-label'] ?? '')),
    );

    expect(handles).toHaveLength(5);
    for (const handle of handles) {
      const hintId = String(handle.props['aria-describedby'] ?? '');
      expect(hintId).not.toBe('');
      const [hint] = findAllElements(rendered, (element) => typeof element.type === 'string' && element.props.id === hintId);
      expect(String(hint?.props.children ?? '')).toMatch(/arrow key/i);
    }
  });
});

describe('SectionSidebar title rename in place', () => {
  beforeEach(() => {
    forgetKeptState();
    vi.clearAllMocks();
    createForm();
  });

  const doubleClickTitle = (title: string) => {
    const [button] = findAllElements(
      render(),
      (element) => element.type === 'button' && element.props.children === title,
    );
    expect(button, title).toBeDefined();
    (button.props.onDoubleClick as () => void)();
  };

  const titleField = () => {
    const [field] = findAllElements(render(), (element) => element.type === Input);
    expect(field).toBeDefined();
    return field;
  };

  const typeAndPress = (text: string, key: string) => {
    (titleField().props.onChange as (event: { target: { value: string } }) => void)({ target: { value: text } });
    (titleField().props.onKeyDown as (event: { key: string }) => void)({ key });
  };

  it("opens a field with the section's title on a double click and keeps the typed title on Enter", () => {
    doubleClickTitle('First section');
    expect(titleField().props.value).toBe('First section');

    typeAndPress('Kickoff', 'Enter');

    expect(sectionTitles()).toEqual(['Kickoff', 'Second section']);
    expect(findAllElements(render(), (element) => element.type === Input)).toEqual([]);
  });

  it('renames a task the same way, and drops the typed title on Escape', () => {
    doubleClickTitle('Task B');
    typeAndPress('Never saved', 'Escape');

    expect(harness.setValue).not.toHaveBeenCalled();
    expect(findAllElements(render(), (element) => element.type === Input)).toEqual([]);

    doubleClickTitle('Task B');
    typeAndPress('Ship it', 'Enter');

    expect(get(harness.form.getValues(), 'sections.0.items.1.title')).toBe('Ship it');
  });
});
