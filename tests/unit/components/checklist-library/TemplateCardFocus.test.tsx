import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';

import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  findAll,
  findHiddenFocusables,
  parseMarkup,
  selfAndAncestors,
  textOf,
} from '../focusVisibility';

// The discovery card on /templates and the category pages shows a 'View Template' button
// over its icon on hover only. Keyboard focus must never land on it while it is invisible.

const template: ChecklistTemplate = {
  id: 'website-launch',
  title: 'Website Launch Checklist',
  isPublic: true,
  sections: [],
  userId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  categories: ['Launch'],
  ownerProfile: { full_name: 'Design Ops', username: 'designops' },
};
const TEMPLATE_PATH = '/profile/designops/website-launch-checklist';

const renderCard = () =>
  renderToStaticMarkup(
    <StaticRouter location="/templates">
      <TemplateCard template={template} />
    </StaticRouter>,
  );

describe('TemplateCard (discovery) keyboard focus', () => {
  it('never lets a keyboard-reachable link take focus while hidden', () => {
    expect(findHiddenFocusables(renderCard())).toEqual([]);
  });

  it('keeps the hover View Template link for pointers but out of the keyboard and screen reader order', () => {
    const root = parseMarkup(renderCard());
    const [overlayLink] = findAll(
      root,
      (node) => node.tag === 'a' && textOf(node).includes('View Template'),
    );

    expect(overlayLink?.attrs.href).toBe(TEMPLATE_PATH);
    expect(overlayLink?.attrs.tabindex).toBe('-1');
    expect(selfAndAncestors(overlayLink).some((node) => node.attrs['aria-hidden'] === 'true')).toBe(
      true,
    );
  });

  it('still reaches the template from the keyboard through the title and Start links', () => {
    const reachable = findAll(
      parseMarkup(renderCard()),
      (node) => node.tag === 'a' && node.attrs.href === TEMPLATE_PATH && node.attrs.tabindex !== '-1',
    );

    expect(reachable.map((link) => textOf(link).trim())).toEqual([
      'Website Launch Checklist',
      'Start',
    ]);
  });
});
