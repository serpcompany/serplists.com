'use client';

import { useEffect, useRef } from 'react';

import { DashboardContentShell, DashboardLoadingState } from '@/components/dashboard/DashboardContentShell';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePageVisit } from '@/hooks/usePageVisit';
import type { PageVisit } from '@/lib/navigation/pageVisit';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { buildConsoleTemplatesPath } from '@/lib/routes';

const DashboardHome = () => {
  const { consoleContext, isWorkspaceLoading } = useWorkspace();
  const router = useAppRouter();
  const beginVisit = usePageVisit();
  const visit = useRef<PageVisit | null>(null);
  const destination = isWorkspaceLoading ? null : buildConsoleTemplatesPath(consoleContext);

  useEffect(() => {
    visit.current = beginVisit();
  }, [beginVisit]);

  useEffect(() => {
    if (destination !== null && visit.current?.isCurrent()) router.replace(destination);
  }, [destination, router]);

  return (
    <div data-dashboard-home="true">
      <DashboardContentShell>
        <DashboardLoadingState />
      </DashboardContentShell>
    </div>
  );
};

export default DashboardHome;
