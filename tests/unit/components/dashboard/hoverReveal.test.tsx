import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RunsDashboardView } from '@/components/dashboard/RunsDashboardView';
import { TemplateCard } from '@/components/dashboard/TemplateCard';
import { TemplateListItem } from '@/components/dashboard/TemplateListItem';
import { getResourcePermissions } from '@/lib/organizationPermissions';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';
import { navigation } from '../../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../../support/nextNavigation')).nextLinkMock);

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// docs/DESIGN.md: a control revealed on hover must also show on keyboard focus and on touch
// screens, which cannot hover. My Templates (grid and list) and the Runs list hid their only
// Start Run, Edit and Delete controls until hover, so phones and tablets never showed them.
// The one exception is a hover-only duplicate of an action reachable elsewhere, which touch
// screens never show at all ([@media(hover:none)]:hidden).

const HIDE = /(^|\s)(\S+:)?opacity-0(\s|$)/;
const HOVER_REVEAL = /group-hover:opacity-100/;
const KEYBOARD_REVEAL = /focus-within:opacity-100|focus-visible:opacity-100/;
// Revealed on touch screens, or hidden only on devices that can hover.
const TOUCH_REVEAL = /\[@media\(hover:none\)\]:opacity-100|\[@media\(hover:hover\)\]:opacity-0/;
const HOVER_ONLY_DUPLICATE = '[@media(hover:none)]:hidden';

const isHoverRevealed = (value: string) => HIDE.test(value) && HOVER_REVEAL.test(value);
const breaksRevealRule = (value: string) =>
  isHoverRevealed(value) &&
  !value.includes(HOVER_ONLY_DUPLICATE) &&
  (!KEYBOARD_REVEAL.test(value) || !TOUCH_REVEAL.test(value));

const classLists = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].map((match) => match[1]);

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

const run: ChecklistRun = {
  id: 'run-1',
  templateId: 'template-1',
  title: 'Quarterly audit',
  status: 'in_progress',
  progress: 0,
  sections: [{ id: 's1', title: 'Checklist', items: [{ id: 'i1', title: 'Check', isCompleted: false }] }],
  startedAt: '2026-01-01T00:00:00.000Z',
  userId: 'user-1',
  revision: 1,
  isStale: true,
  isPublic: false,
};

const render = (element: React.ReactElement) => {
  navigation.reset('/dashboard');
  return renderToStaticMarkup(element);
};

const rendered = {
  'the My Templates grid card': () =>
    render(<TemplateCard onDelete={vi.fn()} onStartRun={vi.fn()} template={template} />),
  'the My Templates list row': () =>
    render(<TemplateListItem onDelete={vi.fn()} onStartRun={vi.fn()} template={template} />),
  'the Runs list row': () =>
    render(
      <RunsDashboardView
        getRunPermissions={() => getResourcePermissions(undefined, () => undefined)}
        onDeleteRun={vi.fn()}
        onRevalidateRun={vi.fn()}
        runs={[run]}
      />,
    ),
};

describe('dashboard hover-revealed controls', () => {
  it.each(Object.entries(rendered))('%s reveals them on keyboard focus and on touch screens', (_name, html) => {
    const lists = classLists(html());

    expect(lists.filter(isHoverRevealed).length).toBeGreaterThan(0);
    expect(lists.filter(breaksRevealRule)).toEqual([]);
  });

  it('keeps the Start Run overlay a hover-only duplicate that touch screens never show', () => {
    // The overlay is the aria-hidden wrapper of the card's pointer-only Start Run button.
    const overlay = rendered['the My Templates grid card']().match(
      /<div aria-hidden="true" class="([^"]*)"><button/,
    )?.[1];

    expect(overlay).toBeDefined();
    expect(isHoverRevealed(overlay!)).toBe(true);
    expect(overlay).toContain(HOVER_ONLY_DUPLICATE);
  });

  // Catches a new dashboard component that hides a control until hover.
  it('has no hover-only class string in src/components/dashboard', () => {
    const dir = path.resolve(__dirname, '../../../../src/components/dashboard');
    const offenders = readdirSync(dir)
      .filter((entry) => /\.(ts|tsx)$/.test(entry))
      .flatMap((entry) =>
        [...readFileSync(path.join(dir, entry), 'utf8').matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)]
          .map((match) => match[2])
          .filter(breaksRevealRule)
          .map((value) => `${entry}: ${value}`),
      );

    expect(offenders).toEqual([]);
  });
});
