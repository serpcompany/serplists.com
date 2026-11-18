import { navigation } from '../../support/mockedNextNavigation';
import '../../support/mockedConsoleContext';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SidebarAccountMenu } from '@/components/layout/AccountMenu';
import { SidebarProvider } from '@/components/ui/sidebar-provider';

import { matchMediaWhere } from '../../support/matchMedia';
import { openTheMenu, renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ logout: vi.fn(), user: { email: 'alice@example.com', id: 'user-1', name: 'Alice', username: 'alice' } }),
}));

theInMemoryBrowserAsTheWindow({ matchMedia: matchMediaWhere((query) => query === '(max-width: 767px)') });

describe("the console sidebar's account menu on a phone", () => {
  it('opens below its button instead of beside the sidebar', async () => {
    navigation.reset('/dashboard/templates/');
    await renderSettled(
      <SidebarProvider>
        <SidebarAccountMenu />
      </SidebarProvider>,
    );

    const [item] = await openTheMenu('Account menu');

    expect(item?.closest('[data-side]')?.getAttribute('data-side')).toBe('bottom');
  });
});
