'use client';

import { useEffect } from 'react';

import { DashboardContentShell, DashboardLoadingState } from '@/components/dashboard/DashboardContentShell';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { buildConsoleTemplatesPath } from '@/lib/routes';

const DashboardHome = () => {
  const { consoleContext, isWorkspaceLoading } = useWorkspace();
  const router = useAppRouter();
  const destination = isWorkspaceLoading ? null : buildConsoleTemplatesPath(consoleContext);

  useEffect(() => {
    if (destination !== null) router.replace(destination);
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
