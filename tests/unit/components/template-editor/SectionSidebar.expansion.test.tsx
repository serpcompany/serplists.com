import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SectionSidebar } from '@/components/template-editor/SectionSidebar';
import type { TemplateEditorSection } from '@/lib/forms/templateEditorForm';

// Unit tests run in node with no DOM, so SectionSidebar is called as a function and its
// element tree is searched. React state lives in slots that persist across calls (as
// between renders), and the field array is a stand-in whose field ids change on every
// reset, as react-hook-form's do. That reproduces the editor's order of events: the
// outline mounts with the blank default section, then the loaded template replaces it.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  slot: 0,
  sections: [] as Array<{ id: string; title: string; items: unknown[] }>,
  fields: [] as Array<Record<string, unknown>>,
  nextFieldId: 0,
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
  const stubs = { useState, useId: () => 'outline' };
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
});

vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>();
  return {
    ...actual,
    useFormContext: () => ({
      control: {},
      getValues: vi.fn(),
      setValue: vi.fn(),
    }),
    useFieldArray: () => ({
      fields: harness.fields,
      append: vi.fn(),
      remove: vi.fn(),
      move: vi.fn(),
    }),
    useWatch: () => harness.sections,
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

const section = (id: string, title: string): TemplateEditorSection => ({
  id,
  title,
  items: [{ id: `${id}-task`, title: `${title} task`, contents: [] }],
});

// Replaces the form's sections, as reset() does: every field gets a new field id.
function resetSections(sections: TemplateEditorSection[]): void {
  harness.sections = sections;
  harness.fields = sections.map((value) => {
    harness.nextFieldId += 1;
    return { ...value, fieldId: `field-${harness.nextFieldId}` };
  });
}

function render(): React.ReactNode {
  harness.slot = 0;
  return SectionSidebar({
    outlineSelectionActive: true,
    selectedSectionIndex: 0,
    selectedItemIndex: null,
    onSelectSection: vi.fn(),
    onSelectItem: vi.fn(),
  });
}

function toggleLabels(tree: React.ReactNode): string[] {
  return findAll(tree, (element) => {
    const label = element.props['aria-label'];
    return typeof label === 'string' && /^(Collapse|Expand) /.test(label);
  }).map((element) => element.props['aria-label'] as string);
}

function clickToggle(tree: React.ReactNode, label: string): void {
  const [button] = findAll(tree, (element) => element.props['aria-label'] === label);
  expect(button).toBeDefined();
  (button.props.onClick as () => void)();
}

describe('SectionSidebar section expansion', () => {
  beforeEach(() => {
    harness.slots = [];
    harness.nextFieldId = 0;
  });

  it('expands every section of a template that loads after the outline mounted', () => {
    resetSections([section('default', '')]);
    render();

    resetSections([
      section('s1', 'Before'),
      section('s2', 'During'),
      section('s3', 'After'),
    ]);
    const tree = render();

    expect(toggleLabels(tree)).toEqual([
      'Collapse Before',
      'Collapse During',
      'Collapse After',
    ]);
    expect(findAll(tree, (element) => element.props.children === 'After task')).toHaveLength(1);
  });

  it('keeps a collapsed section collapsed through a save, a move, and an added section', () => {
    resetSections([section('s1', 'Before'), section('s2', 'During')]);
    clickToggle(render(), 'Collapse During');
    expect(toggleLabels(render())).toEqual(['Collapse Before', 'Expand During']);

    // A save resets the form to the stored values: same sections, new field ids.
    resetSections([section('s1', 'Before'), section('s2', 'During')]);
    expect(toggleLabels(render())).toEqual(['Collapse Before', 'Expand During']);

    // Dragged above the first section, it stays collapsed.
    harness.fields = [harness.fields[1], harness.fields[0]];
    harness.sections = [harness.sections[1], harness.sections[0]];
    expect(toggleLabels(render())).toEqual(['Expand During', 'Collapse Before']);

    resetSections([...harness.sections, section('s3', 'After')]);
    expect(toggleLabels(render())).toEqual([
      'Expand During',
      'Collapse Before',
      'Collapse After',
    ]);
  });
});
