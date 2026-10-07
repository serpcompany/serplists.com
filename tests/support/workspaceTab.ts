import { navigation } from './nextNavigation';
import type { ReactNode } from 'react';
import { afterEach } from 'vitest';

import type { TeamSummary } from '@/lib/api';

import { letQueryUpdatesReachObservers } from './queryNotifications';
import { renderTheWorkspaceProvider, type ShownWorkspace } from './workspaceProviderProbe';

const REMEMBERED_CONTEXT_KEY = 'serplists.activeWorkspaceId';

export type TabOptions = { before?: string[]; page?: ReactNode; remembered?: string };

export const organizationSummary = (id: string, name: string): TeamSummary => ({
  id,
  memberId: `member-${id}`,
  membershipStatus: 'active',
  name,
  role: 'owner',
});

export function oneWorkspaceTabPerTest() {
  let unmountTheTab: () => void = () => {};
  afterEach(() => unmountTheTab());
  return async (url: string, { before = [], page = null, remembered = 'personal' }: TabOptions = {}) => {
    navigation.reset(url, { before });
    navigation.window.localStorage.setItem(REMEMBERED_CONTEXT_KEY, remembered);
    const tab = renderTheWorkspaceProvider(page);
    unmountTheTab = tab.unmount;
    await letQueryUpdatesReachObservers();
    return tab.workspace;
  };
}

export const rememberedContext = (): string | null => navigation.window.localStorage.getItem(REMEMBERED_CONTEXT_KEY);

export type { ShownWorkspace };
