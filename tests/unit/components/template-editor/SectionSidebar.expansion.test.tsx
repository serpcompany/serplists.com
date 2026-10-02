import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SectionSidebar } from '@/components/template-editor/SectionSidebar';
import type { TemplateEditorSection } from '@/lib/forms/templateEditorForm';

import { findAllElements } from '../../../support/elementTree';
import { forgetKeptState, renderKeepingState } from '../../../support/hookStateSlots';

const harness = vi.hoisted(() => ({
  sections: [] as Array<{ id: string; title: string; items: unknown[] }>,
  fields: [] as Array<Record<string, unknown>>,
  nextFieldId: 0,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { useStateKeptBetweenRenders } = await import('../../../support/hookStateSlots');
  const stubs = { useState: useStateKeptBetweenRenders, useId: () => 'outline' };
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

const section = (id: string, title: string): TemplateEditorSection => ({
  id,
  title,
  items: [{ id: `${id}-task`, title: `${title} task`, contents: [] }],
});

function resetSectionsWithNewFieldIds(sections: TemplateEditorSection[]): void {
  harness.sections = sections;
  harness.fields = sections.map((value) => {
    harness.nextFieldId += 1;
    return { ...value, fieldId: `field-${harness.nextFieldId}` };
  });
}

function dragSecondSectionAboveFirst(): void {
  harness.fields = [harness.fields[1], harness.fields[0]];
  harness.sections = [harness.sections[1], harness.sections[0]];
}

function render(): React.ReactNode {
  return renderKeepingState(() =>
    SectionSidebar({
      outlineSelectionActive: true,
      selectedSectionIndex: 0,
      selectedItemIndex: null,
      onSelectSection: vi.fn(),
      onSelectItem: vi.fn(),
    }),
  );
}

function toggleLabels(tree: React.ReactNode): string[] {
  return findAllElements(tree, (element) => {
    const label = element.props['aria-label'];
    return typeof label === 'string' && /^(Collapse|Expand) /.test(label);
  }).map((element) => element.props['aria-label'] as string);
}

function clickToggle(tree: React.ReactNode, label: string): void {
  const [button] = findAllElements(tree, (element) => element.props['aria-label'] === label);
  expect(button).toBeDefined();
  (button.props.onClick as () => void)();
}

describe('SectionSidebar section expansion', () => {
  beforeEach(() => {
    forgetKeptState();
    harness.nextFieldId = 0;
  });

  it('expands every section of a template that loads after the outline mounted with the blank default section', () => {
    resetSectionsWithNewFieldIds([section('default', '')]);
    render();

    resetSectionsWithNewFieldIds([
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
    expect(findAllElements(tree, (element) => element.props.children === 'After task')).toHaveLength(1);
  });

  it('keeps a collapsed section collapsed through a save, a move, and an added section', () => {
    resetSectionsWithNewFieldIds([section('s1', 'Before'), section('s2', 'During')]);
    clickToggle(render(), 'Collapse During');
    expect(toggleLabels(render())).toEqual(['Collapse Before', 'Expand During']);

    const storedSectionsAfterSave = [section('s1', 'Before'), section('s2', 'During')];
    resetSectionsWithNewFieldIds(storedSectionsAfterSave);
    expect(toggleLabels(render())).toEqual(['Collapse Before', 'Expand During']);

    dragSecondSectionAboveFirst();
    expect(toggleLabels(render())).toEqual(['Expand During', 'Collapse Before']);

    resetSectionsWithNewFieldIds([...harness.sections, section('s3', 'After')]);
    expect(toggleLabels(render())).toEqual([
      'Expand During',
      'Collapse Before',
      'Collapse After',
    ]);
  });
});
