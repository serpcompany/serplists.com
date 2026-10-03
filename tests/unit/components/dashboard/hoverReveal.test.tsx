import { navigation } from '../../../support/mockedNextNavigation';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { capturedGroup } from '../../../support/elements';

import { RunsDashboardView } from '@/components/dashboard/RunsDashboardView';
import { TemplateCard } from '@/components/dashboard/TemplateCard';
import { TemplateListItem } from '@/components/dashboard/TemplateListItem';
import { PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import { getResourcePermissions } from '@/lib/organizationPermissions';
import type { ChecklistRun } from '@/types/checklist';
import { PRIVATE_LAUNCH_TEMPLATE } from '../../../fixtures/dashboardTemplate';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const HIDE = /(^|\s)(\S+:)?opacity-0(\s|$)/;
const HOVER_REVEAL = /group-hover:opacity-100/;
const KEYBOARD_REVEAL = /focus-within:opacity-100|focus-visible:opacity-100/;
const REVEALED_ON_TOUCH_SCREENS = /\[@media\(hover:none\)\]:opacity-100/;
const HIDDEN_ONLY_WHERE_THE_DEVICE_CAN_HOVER = /\[@media\(hover:hover\)\]:opacity-0/;
const HOVER_ONLY_DUPLICATE = '[@media(hover:none)]:hidden';

const isHoverRevealed = (value: string) => HIDE.test(value) && HOVER_REVEAL.test(value);
const showsOnTouchScreens = (value: string) =>
  REVEALED_ON_TOUCH_SCREENS.test(value) || HIDDEN_ONLY_WHERE_THE_DEVICE_CAN_HOVER.test(value);
const breaksRevealRule = (value: string) =>
  isHoverRevealed(value) &&
  !value.includes(HOVER_ONLY_DUPLICATE) &&
  (!KEYBOARD_REVEAL.test(value) || !showsOnTouchScreens(value));
const pointerOnlyStartRunWrapperClass = (html: string) =>
  capturedGroup(html.match(/<div aria-hidden="true" class="([^"]*)"><button/), 1);

const classLists = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].map((match) => capturedGroup(match, 1));

const template = PRIVATE_LAUNCH_TEMPLATE;

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
    render(<TemplateCard context={PERSONAL_CONSOLE} onDelete={vi.fn()} onStartRun={vi.fn()} template={template} />),
  'the My Templates list row': () =>
    render(<TemplateListItem context={PERSONAL_CONSOLE} onDelete={vi.fn()} onStartRun={vi.fn()} template={template} />),
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
    const overlay = pointerOnlyStartRunWrapperClass(rendered['the My Templates grid card']());

    expect(isHoverRevealed(overlay)).toBe(true);
    expect(overlay).toContain(HOVER_ONLY_DUPLICATE);
  });

});
