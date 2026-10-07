import { navigation } from '../../../support/mockedNextNavigation';
import { personalWorkspaceState as workspaceState } from '../../../support/mockedPersonalWorkspace';
import React from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';

import { openTheMenu, renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();

async function openTheSwitcherInTheConsoleSidebar() {
  navigation.reset('/dashboard/settings');
  await renderSettled(
    <SidebarProvider>
      <WorkspaceSwitcher />
    </SidebarProvider>,
  );
  await openTheMenu('Switch context');
}

const retries = () => screen.queryAllByRole('menuitem', { name: 'Retry loading Organizations' });
const teamsLoadError = () => screen.queryByText("Couldn't load your Organizations");

describe('WorkspaceSwitcher in Personal, which never waits on the teams request', () => {
  beforeEach(() => {
    workspaceState.status = 'ready';
    workspaceState.teamsUnavailable = false;
  });

  it('says the Organizations could not load and offers a retry when the teams request failed, instead of reading as no Organizations', async () => {
    workspaceState.teamsUnavailable = true;
    await openTheSwitcherInTheConsoleSidebar();

    expect(teamsLoadError()).not.toBeNull();
    expect(retries()).toHaveLength(1);
  });

  it('still shows the tab in Personal when the teams request failed, since Personal work is not blocked', async () => {
    workspaceState.teamsUnavailable = true;
    await openTheSwitcherInTheConsoleSidebar();

    expect(screen.getAllByText('Personal').length).toBeGreaterThan(0);
  });

  it('offers no retry once the teams request succeeded', async () => {
    await openTheSwitcherInTheConsoleSidebar();

    expect(teamsLoadError()).toBeNull();
    expect(retries()).toHaveLength(0);
  });

  it('offers the retry once when the stored Organization is unconfirmed', async () => {
    workspaceState.status = 'error';
    workspaceState.teamsUnavailable = true;
    await openTheSwitcherInTheConsoleSidebar();

    expect(retries()).toHaveLength(1);
    expect(screen.getByText('Organizations unavailable')).toBeDefined();
  });
});
