import React from 'react';
import { createFormControl, get } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentEditor } from '@/components/template-editor/ContentEditor';
import { SubItemsEditor } from '@/components/template-editor/content-types/SubItemsEditor';
import {
  buildTemplateEditorFormValues,
  type TemplateEditorContent,
  type TemplateEditorFormValues,
} from '@/lib/forms/templateEditorForm';

// Unit tests run in node with no DOM, so ContentEditor is called as a function and its
// element tree is searched (as in ContentEditor.upload.test.tsx). React state lives in
// slots that persist across calls, and the field array's move reorders the real form
// values the way useFieldArray.move does.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  slot: 0,
  form: null as unknown as ReturnType<typeof import('react-hook-form').createFormControl>,
  move: null as unknown as (from: number, to: number) => void,
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
  const stubs = { useState, useId: () => 'blocks', useContext: () => null };
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
});

vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>();
  return {
    ...actual,
    useFormContext: () => harness.form,
    useWatch: ({ name }: { name: string }) =>
      structuredClone(actual.get(harness.form.getValues(), name)),
    useFieldArray: ({ name }: { name: string }) => ({
      fields: ((actual.get(harness.form.getValues(), name) ?? []) as TemplateEditorContent[]).map(
        (content) => ({ ...content, fieldId: `field-${content.id}` }),
      ),
      append: vi.fn(),
      remove: vi.fn(),
      move: (from: number, to: number) => {
        harness.move(from, to);
        const next = [...((actual.get(harness.form.getValues(), name) ?? []) as TemplateEditorContent[])];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        harness.form.setValue(name as `sections.0.items.0.contents`, next, { shouldDirty: true });
      },
    }),
  };
});

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

type AnyElement = React.ReactElement<Record<string, unknown>>;

function findAll(node: React.ReactNode, predicate: (element: AnyElement) => boolean): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  if (!React.isValidElement(node)) return [];
  const element = node as AnyElement;
  const matches = predicate(element) ? [element] : [];
  return [...matches, ...findAll(element.props.children as React.ReactNode, predicate)];
}

// Buttons can be rendered by small components (the drag handle), so render those one
// level too. Editors with their own hooks are left alone.
const RENDERED_COMPONENTS = new Set(['ReorderHandle', 'ReorderHint']);
function withComponentOutput(tree: React.ReactNode): React.ReactNode[] {
  const outputs = findAll(
    tree,
    (element) =>
      typeof element.type === 'function' && RENDERED_COMPONENTS.has((element.type as { name: string }).name),
  ).map((element) => (element.type as (props: unknown) => React.ReactNode)(element.props));
  return [tree, ...outputs];
}

function findDomElement(tree: React.ReactNode, predicate: (element: AnyElement) => boolean): AnyElement | undefined {
  return findAll(withComponentOutput(tree), (element) => typeof element.type === 'string' && predicate(element))[0];
}

const CONTENT_PATH = 'sections.0.items.0.contents';

function createForm(): void {
  harness.form = createFormControl<TemplateEditorFormValues>({
    defaultValues: buildTemplateEditorFormValues({
      sections: [
        {
          id: 's1',
          title: 'Section',
          items: [
            {
              id: 'i1',
              title: 'Task',
              contents: [
                { id: 'c-text', type: 'text', value: 'Intro' },
                { id: 'c-image', type: 'image', value: 'https://example.com/a.png' },
                {
                  id: 'c-subs',
                  type: 'subItems',
                  value: '',
                  subItems: [{ id: 'sub-1', title: 'Laptop' }],
                },
              ],
            },
          ],
        },
      ],
    }),
  }) as typeof harness.form;
  harness.form.control._state.mount = true;
}

function render(): React.ReactNode {
  harness.slot = 0;
  return ContentEditor({ itemIndex: 0, sectionIndex: 0 });
}

const contentIds = () =>
  (get(harness.form.getValues(), CONTENT_PATH) as TemplateEditorContent[]).map((content) => content.id);

const keyEvent = (key: string) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  preventDefault: vi.fn(),
});

function dragEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { setData: vi.fn(), effectAllowed: '', dropEffect: '' },
  };
}

function handle(tree: React.ReactNode, name: string): AnyElement {
  const button = findDomElement(tree, (element) => element.props['aria-label'] === name);
  expect(button, `a button named ${name}`).toBeDefined();
  return button!;
}

// Each block's container takes the drop.
function blockContainer(tree: React.ReactNode, index: number): AnyElement {
  const containers = findAll(tree, (element) => typeof element.props.onDrop === 'function');
  expect(containers.length).toBeGreaterThan(index);
  return containers[index];
}

describe('ContentEditor block reordering', () => {
  beforeEach(() => {
    harness.slots = [];
    harness.move = vi.fn();
    createForm();
  });

  it('gives every block a real drag handle instead of a decorative one', () => {
    const tree = render();

    for (const name of ['Drag Text block', 'Drag Image block', 'Drag Sub-tasks block']) {
      const button = handle(tree, name);
      expect(button.type).toBe('button');
      expect(button.props.draggable).toBe(true);
    }
    expect(
      findAll(tree, (element) => typeof element.type === 'string' && String(element.props.className ?? '').includes('cursor-grab')),
    ).toEqual([]);
  });

  it('moves a block up with the arrow key and keeps its id', () => {
    const event = keyEvent('ArrowUp');
    (handle(render(), 'Drag Image block').props.onKeyDown as (event: unknown) => void)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(harness.move).toHaveBeenCalledWith(1, 0);
    expect(contentIds()).toEqual(['c-image', 'c-text', 'c-subs']);
    const status = findDomElement(render(), (element) => element.props['aria-live'] === 'polite');
    expect(status?.props.children).toBe('Moved Image block to position 1 of 3');
  });

  it('does not move the first block up or the last block down', () => {
    (handle(render(), 'Drag Text block').props.onKeyDown as (event: unknown) => void)(keyEvent('ArrowUp'));
    (handle(render(), 'Drag Sub-tasks block').props.onKeyDown as (event: unknown) => void)(keyEvent('ArrowDown'));

    expect(harness.move).not.toHaveBeenCalled();
    expect(contentIds()).toEqual(['c-text', 'c-image', 'c-subs']);
  });

  it('moves a block dragged onto another block', () => {
    (handle(render(), 'Drag Sub-tasks block').props.onDragStart as (event: unknown) => void)(dragEvent());

    const over = dragEvent();
    (blockContainer(render(), 0).props.onDragOver as (event: unknown) => void)(over);
    expect(over.preventDefault).toHaveBeenCalled();
    expect(findAll(render(), (element) => element.props['data-drop-indicator'] === 'content-before')).toHaveLength(1);

    (blockContainer(render(), 0).props.onDrop as (event: unknown) => void)(dragEvent());

    expect(harness.move).toHaveBeenCalledWith(2, 0);
    expect(contentIds()).toEqual(['c-subs', 'c-text', 'c-image']);
    expect(get(harness.form.getValues(), `${CONTENT_PATH}.0.subItems`)).toEqual([
      expect.objectContaining({ id: 'sub-1', title: 'Laptop' }),
    ]);
    expect(findAll(render(), (element) => element.props['data-drop-indicator'] !== undefined)).toEqual([]);
  });

  it('ignores a drag that did not start on one of its block handles', () => {
    const over = dragEvent();
    (blockContainer(render(), 0).props.onDragOver as (event: unknown) => void)(over);
    (blockContainer(render(), 0).props.onDrop as (event: unknown) => void)(dragEvent());

    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(harness.move).not.toHaveBeenCalled();
  });

  // The sub-task list's field array is named by the block's index, so it is remounted
  // when the block moves rather than kept with a stale name.
  it('renders the moved sub-task list at its new index', () => {
    const before = findAll(render(), (element) => element.type === SubItemsEditor)[0];
    (handle(render(), 'Drag Sub-tasks block').props.onKeyDown as (event: unknown) => void)(keyEvent('ArrowUp'));
    const after = findAll(render(), (element) => element.type === SubItemsEditor)[0];

    expect(before.props.contentIndex).toBe(2);
    expect(after.props.contentIndex).toBe(1);
    expect(after.key).not.toBe(before.key);
  });
});
