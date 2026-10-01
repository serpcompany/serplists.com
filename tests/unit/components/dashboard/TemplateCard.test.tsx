import { navigation } from '../../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateCard } from '@/components/dashboard/TemplateCard';
import type { ChecklistTemplate } from '@/types/checklist';
import { findAll, findHiddenFocusables, parseMarkup, type MarkupNode } from '../focusVisibility';

const template: ChecklistTemplate = {
  id: 'template-1',
  title: 'Website Launch Checklist',
  description: 'Launch workflow',
  type: 'checklist',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: false,
  categories: [],
  tags: [],
};

const findTags = (root: MarkupNode, tag: string): MarkupNode[] => findAll(root, (node) => node.tag === tag);

function accessibleName(node: MarkupNode): string {
  if (node.attrs['aria-label']) return node.attrs['aria-label'].trim();
  const text = (current: MarkupNode): string =>
    current.tag === '#text'
      ? current.text
      : current.attrs['aria-hidden'] === 'true'
        ? ''
        : current.children.map(text).join('');
  return text(node).trim();
}

function renderCardMarkup(overrides: Partial<ChecklistTemplate> = {}) {
  navigation.reset('/dashboard/templates');
  return renderToStaticMarkup(
    <TemplateCard
      onDelete={vi.fn()}
      onStartRun={vi.fn()}
      template={{ ...template, ...overrides }}
    />,
  );
}

const renderCard = (overrides: Partial<ChecklistTemplate> = {}) => parseMarkup(renderCardMarkup(overrides));

function keyboardButtons(root: MarkupNode) {
  return findTags(root, 'button').filter(
    (button) => button.attrs.tabindex !== '-1' && !('disabled' in button.attrs),
  );
}

describe('TemplateCard (My Templates grid)', () => {
  it('names the actions menu button after the template', () => {
    const root = renderCard();
    const trigger = findTags(root, 'button').find((button) => button.attrs['aria-haspopup'] === 'menu');

    expect(trigger).toBeDefined();
    expect(trigger?.attrs['aria-label']).toBe('Actions for Website Launch Checklist');
  });

  it('falls back to a generic actions name when the title is blank', () => {
    const root = renderCard({ title: '   ' });
    const trigger = findTags(root, 'button').find((button) => button.attrs['aria-haspopup'] === 'menu');

    expect(trigger?.attrs['aria-label']).toBe('Template actions');
  });

  it('gives every keyboard-reachable button an accessible name', () => {
    const buttons = keyboardButtons(renderCard());

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(accessibleName(button)).not.toBe('');
    }
  });

  it('never lets a keyboard-reachable control take focus while invisible or inside content hidden from assistive tech', () => {
    expect(keyboardButtons(renderCard()).length).toBeGreaterThan(0);
    expect(findHiddenFocusables(renderCardMarkup())).toEqual([]);
  });

  it('keeps the hover Start Run shortcut for pointers but out of the keyboard and screen reader order', () => {
    const root = renderCard();
    const overlayButton = findTags(root, 'button').find(
      (button) => accessibleName(button) === 'Start Run',
    );

    expect(overlayButton).toBeDefined();
    expect(overlayButton?.attrs.tabindex).toBe('-1');
    expect(overlayButton?.parent?.attrs['aria-hidden']).toBe('true');
  });
});

describe('TemplateCard counts', () => {
  it('counts one section and one task in the singular, never "1 sections" or "1 tasks"', () => {
    navigation.reset('/dashboard/templates');
    const html = renderToStaticMarkup(
      <TemplateCard
        template={{
          ...template,
          sections: [{ id: 'section-1', title: 'Launch prep', items: [{ id: 'item-1', title: 'Freeze content', description: '', contents: [] }] }],
        }}
      />,
    );

    expect(html).toContain('>1 section<');
    expect(html).toContain('>1 task<');
  });
});
