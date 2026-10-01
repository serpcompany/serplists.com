import React from 'react';
import { get } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentEditor } from '@/components/template-editor/ContentEditor';
import { SubItemsEditor } from '@/components/template-editor/content-types/SubItemsEditor';
import type { TemplateEditorContent } from '@/lib/forms/templateEditorForm';

import { createFormControlMountedLikeUseForm } from '../../../support/editorFormControl';
import { findAllElements, type AnyElement } from '../../../support/elementTree';
import { forgetKeptState, renderKeepingState } from '../../../support/hookStateSlots';

const harness = vi.hoisted(() => ({
  form: null as unknown as ReturnType<typeof import('react-hook-form').createFormControl>,
  move: null as unknown as (from: number, to: number) => void,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { useStateKeptBetweenRenders } = await import('../../../support/hookStateSlots');
  const stubs = { useState: useStateKeptBetweenRenders, useId: () => 'blocks', useContext: () => null };
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
});

vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>();
  const watchedValueSnapshot = ({ name }: { name: string }) =>
    structuredClone(actual.get(harness.form.getValues(), name));
  return {
    ...actual,
    useFormContext: () => harness.form,
    useWatch: watchedValueSnapshot,
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

const HOOKLESS_COMPONENTS_THAT_RENDER_BUTTONS = new Set(['ReorderHandle', 'ReorderHint']);
function withHooklessComponentsRendered(tree: React.ReactNode): React.ReactNode[] {
  const outputs = findAllElements(
    tree,
    (element) =>
      typeof element.type === 'function' &&
      HOOKLESS_COMPONENTS_THAT_RENDER_BUTTONS.has((element.type as { name: string }).name),
  ).map((element) => (element.type as (props: unknown) => React.ReactNode)(element.props));
  return [tree, ...outputs];
}

function findDomElement(tree: React.ReactNode, predicate: (element: AnyElement) => boolean): AnyElement | undefined {
  return findAllElements(withHooklessComponentsRendered(tree), (element) => typeof element.type === 'string' && predicate(element))[0];
}

const CONTENT_PATH = 'sections.0.items.0.contents';

function createForm(): void {
  harness.form = createFormControlMountedLikeUseForm({
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
  }) as unknown as typeof harness.form;
}

function render(): React.ReactNode {
  return renderKeepingState(() => ContentEditor({ itemIndex: 0, sectionIndex: 0 }));
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

function blockDropTarget(tree: React.ReactNode, index: number): AnyElement {
  const containers = findAllElements(tree, (element) => typeof element.props.onDrop === 'function');
  expect(containers.length).toBeGreaterThan(index);
  return containers[index];
}

describe('ContentEditor block reordering', () => {
  beforeEach(() => {
    forgetKeptState();
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
      findAllElements(tree, (element) => typeof element.type === 'string' && String(element.props.className ?? '').includes('cursor-grab')),
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
    (blockDropTarget(render(), 0).props.onDragOver as (event: unknown) => void)(over);
    expect(over.preventDefault).toHaveBeenCalled();
    expect(findAllElements(render(), (element) => element.props['data-drop-indicator'] === 'content-before')).toHaveLength(1);

    (blockDropTarget(render(), 0).props.onDrop as (event: unknown) => void)(dragEvent());

    expect(harness.move).toHaveBeenCalledWith(2, 0);
    expect(contentIds()).toEqual(['c-subs', 'c-text', 'c-image']);
    expect(get(harness.form.getValues(), `${CONTENT_PATH}.0.subItems`)).toEqual([
      expect.objectContaining({ id: 'sub-1', title: 'Laptop' }),
    ]);
    expect(findAllElements(render(), (element) => element.props['data-drop-indicator'] !== undefined)).toEqual([]);
  });

  it('puts the dragged block in the drag data as the drag starts, since Firefox starts no drag without data', () => {
    const start = dragEvent();
    (handle(render(), 'Drag Sub-tasks block').props.onDragStart as (event: unknown) => void)(start);

    expect(start.dataTransfer.setData).toHaveBeenCalledTimes(1);
  });

  it('ignores a drag that did not start on one of its block handles', () => {
    const over = dragEvent();
    (blockDropTarget(render(), 0).props.onDragOver as (event: unknown) => void)(over);
    (blockDropTarget(render(), 0).props.onDrop as (event: unknown) => void)(dragEvent());

    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(harness.move).not.toHaveBeenCalled();
  });

  it('renders the moved sub-task list at its new index under a new key, so its field array, named by that index, remounts instead of keeping a stale name', () => {
    const before = findAllElements(render(), (element) => element.type === SubItemsEditor)[0];
    (handle(render(), 'Drag Sub-tasks block').props.onKeyDown as (event: unknown) => void)(keyEvent('ArrowUp'));
    const after = findAllElements(render(), (element) => element.type === SubItemsEditor)[0];

    expect(before.props.contentIndex).toBe(2);
    expect(after.props.contentIndex).toBe(1);
    expect(after.key).not.toBe(before.key);
  });
});
