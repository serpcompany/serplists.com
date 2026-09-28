import React from 'react';
import { createFormControl, get } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SectionSidebar } from '@/components/template-editor/SectionSidebar';
import {
  buildTemplateEditorFormValues,
  type TemplateEditorFormValues,
} from '@/lib/forms/templateEditorForm';

// Unit tests run in node with no DOM, so SectionSidebar is called as a function and its
// element tree is searched (as in SectionSidebar.expansion.test.tsx). React state lives in
// slots that persist across calls, and the form is a real react-hook-form control whose
// field array moves entries the way useFieldArray.move does.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  slot: 0,
  form: null as unknown as ReturnType<typeof import('react-hook-form').createFormControl>,
  setValue: null as unknown as (...args: unknown[]) => void,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useState = <T,>(initial: T | (() => T)) => {
    const index = harness.slot;
    harness.slot += 1;
    if (!(index in harness.slots)) {
      harness.slots[index] =
        typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const setState = (next: T | ((current: T) => T)) => {
      harness.slots[index] =
        typeof next === 'function'
          ? (next as (current: T) => T)(harness.slots[index] as T)
          : next;
    };
    return [harness.slots[index] as T, setState] as const;
  };
  const stubs = { useState, useId: () => "outline" };
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
});

vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>();
  return {
    ...actual,
    useFormContext: () => ({
      control: {},
      getValues: (name?: string) =>
        name ? actual.get(harness.form.getValues(), name) : harness.form.getValues(),
      setValue: harness.setValue,
    }),
    useFieldArray: ({ name }: { name: string }) => {
      const values = (actual.get(harness.form.getValues(), name) ?? []) as Array<{ id: string }>;
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
    useWatch: ({ name }: { name: string }) => structuredClone(actual.get(harness.form.getValues(), name)),
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

type AnyElement = React.ReactElement<Record<string, unknown>>;

function findAll(node: React.ReactNode, predicate: (element: AnyElement) => boolean): AnyElement[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => findAll(child, predicate));
  }
  if (!React.isValidElement(node)) return [];
  const element = node as AnyElement;
  const matches = predicate(element) ? [element] : [];
  return [...matches, ...findAll(element.props.children as React.ReactNode, predicate)];
}

const selection = {
  onSelectSection: vi.fn(),
  onSelectItem: vi.fn(),
};

function createForm(): void {
  harness.form = createFormControl<TemplateEditorFormValues>({
    defaultValues: buildTemplateEditorFormValues({
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
    }),
  }) as typeof harness.form;
  harness.form.control._state.mount = true;
  const setValue = harness.form.setValue as (...args: unknown[]) => void;
  harness.setValue = vi.fn((...args: unknown[]) => setValue(...args));
}

function render(props: { selectedSectionIndex?: number; selectedItemIndex?: number | null } = {}): React.ReactNode {
  harness.slot = 0;
  return SectionSidebar({
    outlineSelectionActive: true,
    selectedSectionIndex: props.selectedSectionIndex ?? 0,
    selectedItemIndex: props.selectedItemIndex ?? null,
    ...selection,
  });
}

// The tree plus what each function component in it renders (one level, by calling it as
// SectionSidebar is called), so buttons rendered by the outline's components are found.
function withComponentOutput(tree: React.ReactNode): React.ReactNode[] {
  const outputs = findAll(tree, (element) => typeof element.type === 'function').flatMap((element) => {
    try {
      return [(element.type as (props: unknown) => React.ReactNode)(element.props)];
    } catch {
      return [];
    }
  });
  return [tree, ...outputs];
}

// The DOM element (not a component) named `name`.
function findButton(tree: React.ReactNode, name: string): AnyElement | undefined {
  return findAll(
    withComponentOutput(tree),
    (element) => typeof element.type === 'string' && element.props['aria-label'] === name,
  )[0];
}

function pressOnHandle(tree: React.ReactNode, name: string, key: string) {
  const handle = findButton(tree, name);
  expect(handle).toBeDefined();
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
  const [region] = findAll(
    withComponentOutput(tree),
    (element) => typeof element.type === 'string' && element.props['aria-live'] === 'polite',
  );
  return region ? String(region.props.children ?? '') : '';
}

describe('SectionSidebar keyboard reordering', () => {
  beforeEach(() => {
    harness.slots = [];
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
    const rendered = withComponentOutput(render());
    const handles = findAll(
      rendered,
      (element) => typeof element.type === 'string' && /^Drag /.test(String(element.props['aria-label'] ?? '')),
    );

    expect(handles).toHaveLength(5);
    for (const handle of handles) {
      const hintId = String(handle.props['aria-describedby'] ?? '');
      expect(hintId).not.toBe('');
      const [hint] = findAll(rendered, (element) => typeof element.type === 'string' && element.props.id === hintId);
      expect(String(hint?.props.children ?? '')).toMatch(/arrow key/i);
    }
  });
});
