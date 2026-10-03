import '../../support/reactHooksKeptBetweenRenders';
import { navigation } from '../../support/mockedNextNavigation';
import '../../support/mockedConsoleContext';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: null }) }));

import { PublicMobileNav } from '@/components/layout/PublicMobileNav';
import { Sheet } from '@/components/ui/sheet';

import { findElement, handlerOf } from '../../support/elementTree';
import { forgetKeptState, renderUntilNoStateIsSetDuringRender } from '../../support/hookStateSlots';

const renderSheet = () => {
  const sheet = findElement(renderUntilNoStateIsSetDuringRender(() => PublicMobileNav()), (element) => element.type === Sheet);
  assert.exists(sheet);
  return sheet;
};

const openSheet = () => {
  handlerOf(renderSheet(), 'onOpenChange')(true);
  expect(renderSheet().props.open).toBe(true);
};

afterEach(() => {
  forgetKeptState();
});

describe('PublicMobileNav, the public menu sheet on phones', () => {
  it('stays open while the page stays the same', () => {
    navigation.reset('/');
    openSheet();

    expect(renderSheet().props.open).toBe(true);
  });

  it('closes when Back opens another page, which no link in the sheet was clicked for', async () => {
    navigation.reset('/pricing/', { before: ['/'] });
    openSheet();

    navigation.window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(navigation.pathname()).toBe('/');
    expect(renderSheet().props.open).toBe(false);
  });

  it('closes on any other page change, such as a link outside the sheet', () => {
    navigation.reset('/');
    openSheet();

    navigation.reset('/templates/');

    expect(renderSheet().props.open).toBe(false);
  });
});
