import { navigation } from '../../../support/mockedNextNavigation';
import { personalWorkspaceState as workspaceState } from '../../../support/mockedPersonalWorkspace';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/dropdown-menu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/dropdown-menu')>()),
  ...(await import('../../../support/overlaysInPlace')).dropdownMenuRenderedOpen,
}));

import { SidebarProvider } from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';

const renderSwitcherInConsoleSidebar = () => {
  navigation.reset('/dashboard/settings');
  return renderToStaticMarkup(
    <SidebarProvider>
      <WorkspaceSwitcher />
    </SidebarProvider>,
  );
};

const count = (html: string, text: string) => html.split(text).length - 1;

describe('WorkspaceSwitcher in Personal, which never waits on the teams request', () => {
  beforeEach(() => {
    workspaceState.status = 'ready';
    workspaceState.teamsUnavailable = false;
  });

  it('says the Organizations could not load and offers a retry when the teams request failed, instead of reading as no Organizations', () => {
    workspaceState.teamsUnavailable = true;
    const html = renderSwitcherInConsoleSidebar();

    expect(html).toContain('Couldn&#x27;t load your Organizations');
    expect(html).toContain('Retry loading Organizations');
  });

  it('still shows the tab in Personal when the teams request failed, since Personal work is not blocked', () => {
    workspaceState.teamsUnavailable = true;

    expect(renderSwitcherInConsoleSidebar()).toContain('>Personal<');
  });

  it('offers no retry once the teams request succeeded', () => {
    const html = renderSwitcherInConsoleSidebar();

    expect(html).not.toContain('Couldn&#x27;t load your Organizations');
    expect(html).not.toContain('Retry loading Organizations');
  });

  it('offers the retry once when the stored Organization is unconfirmed', () => {
    workspaceState.status = 'error';
    workspaceState.teamsUnavailable = true;
    const html = renderSwitcherInConsoleSidebar();

    expect(count(html, 'Retry loading Organizations')).toBe(1);
    expect(html).toContain('Organizations unavailable');
  });
});
