import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

import { buildEquivalentConsolePath } from '@/lib/consoleRoutes';
import { leavesPage } from '@/lib/navigation/leavesPage';
import { useAppRouter } from '@/lib/navigation/useAppRouter';

import { toConsoleContext } from './workspaceSelection';

export type ContextSwitchActions = {
  isShownContext: (workspaceId: string) => boolean;
  selectInPlace: (workspaceId: string) => void;
  beforeLeavingFor: (workspaceId: string) => void;
};

export function useContextSwitch(actions: ContextSwitchActions): (workspaceId: string) => void {
  const pathname = usePathname();
  const router = useAppRouter();
  const latest = useRef({ actions, pathname, router });

  useEffect(() => {
    latest.current = { actions, pathname, router };
  });

  return useCallback((workspaceId: string) => {
    const { actions: current, pathname: currentPath, router: currentRouter } = latest.current;
    const destination =
      current.isShownContext(workspaceId)
        ? null
        : buildEquivalentConsolePath(currentPath, toConsoleContext(workspaceId));
    if (destination === null || !leavesPage(destination, currentPath)) {
      current.selectInPlace(workspaceId);
      return;
    }
    currentRouter.push(destination, { onLeave: () => current.beforeLeavingFor(workspaceId) });
  }, []);
}
