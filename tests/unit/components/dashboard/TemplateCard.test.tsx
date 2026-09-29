import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateCard } from '@/components/dashboard/TemplateCard';
import type { ChecklistTemplate } from '@/types/checklist';
import { navigation } from '../../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../../support/nextNavigation')).nextLinkMock);

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

type MarkupNode = {
  attrs: Record<string, string>;
  children: MarkupNode[];
  parent: MarkupNode | null;
  tag: string;
  text: string;
};

// A tiny parser for React's static markup: enough to walk ancestors and read attributes.
function parseMarkup(html: string): MarkupNode {
  const root: MarkupNode = { attrs: {}, children: [], parent: null, tag: '#root', text: '' };
  const voidTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
  const tokens = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let current = root;
  for (const match of html.matchAll(tokens)) {
    const [, closing, tag, rawAttrs, selfClosing, text] = match;
    if (text !== undefined) {
      current.children.push({ attrs: {}, children: [], parent: current, tag: '#text', text });
      continue;
    }
    if (closing) {
      current = current.parent ?? root;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const attr of rawAttrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
      attrs[attr[1]] = attr[2] ?? '';
    }
    const node: MarkupNode = { attrs, children: [], parent: current, tag, text: '' };
    current.children.push(node);
    if (!selfClosing && !voidTags.has(tag)) current = node;
  }
  return root;
}

function findAll(node: MarkupNode, tag: string): MarkupNode[] {
  return node.children.flatMap((child) => [
    ...(child.tag === tag ? [child] : []),
    ...findAll(child, tag),
  ]);
}

function selfAndAncestors(node: MarkupNode): MarkupNode[] {
  const chain: MarkupNode[] = [];
  for (let current: MarkupNode | null = node; current; current = current.parent) chain.push(current);
  return chain;
}

function classTokens(node: MarkupNode): string[] {
  return (node.attrs.class ?? '').split(/\s+/).filter(Boolean);
}

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

function renderCard(overrides: Partial<ChecklistTemplate> = {}) {
  navigation.reset('/dashboard/templates');
  const html = renderToStaticMarkup(
    <TemplateCard
      onDelete={vi.fn()}
      onStartRun={vi.fn()}
      template={{ ...template, ...overrides }}
    />,
  );
  return parseMarkup(html);
}

function keyboardButtons(root: MarkupNode) {
  return findAll(root, 'button').filter(
    (button) => button.attrs.tabindex !== '-1' && !('disabled' in button.attrs),
  );
}

describe('TemplateCard (My Templates grid)', () => {
  it('names the actions menu button after the template', () => {
    const root = renderCard();
    const trigger = findAll(root, 'button').find((button) => button.attrs['aria-haspopup'] === 'menu');

    expect(trigger).toBeDefined();
    expect(trigger?.attrs['aria-label']).toBe('Actions for Website Launch Checklist');
  });

  it('falls back to a generic actions name when the title is blank', () => {
    const root = renderCard({ title: '   ' });
    const trigger = findAll(root, 'button').find((button) => button.attrs['aria-haspopup'] === 'menu');

    expect(trigger?.attrs['aria-label']).toBe('Template actions');
  });

  it('gives every keyboard-reachable button an accessible name', () => {
    const buttons = keyboardButtons(renderCard());

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(accessibleName(button)).not.toBe('');
    }
  });

  it('never lets a keyboard-reachable button take focus while hidden', () => {
    for (const button of keyboardButtons(renderCard())) {
      for (const node of selfAndAncestors(button)) {
        const tokens = classTokens(node);
        // A focusable control must not sit inside content hidden from assistive tech.
        expect(node.attrs['aria-hidden']).not.toBe('true');
        if (tokens.includes('opacity-0')) {
          expect(
            tokens.some((token) => /^(group-)?focus-(within|visible):opacity-100$/.test(token)),
          ).toBe(true);
        }
        if (tokens.includes('translate-y-full')) {
          expect(
            tokens.some((token) => /^(group-)?focus-(within|visible):translate-y-0$/.test(token)),
          ).toBe(true);
        }
      }
    }
  });

  it('keeps the hover Start Run shortcut for pointers but out of the keyboard and screen reader order', () => {
    const root = renderCard();
    const overlayButton = findAll(root, 'button').find(
      (button) => accessibleName(button) === 'Start Run',
    );

    expect(overlayButton).toBeDefined();
    expect(overlayButton?.attrs.tabindex).toBe('-1');
    expect(overlayButton?.parent?.attrs['aria-hidden']).toBe('true');
  });
});
