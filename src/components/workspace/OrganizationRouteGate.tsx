'use client';

import type { ReactNode } from 'react';

import { DashboardContentShell, DashboardLoadingState } from '@/components/dashboard/DashboardContentShell';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import NotFound from '@/views/NotFound';

export function OrganizationRouteGate({ children }: { children: ReactNode }) {
  const { routeOrganizationStatus } = useWorkspace();

  if (routeOrganizationStatus === 'confirmed') {
    return <>{children}</>;
  }

  if (routeOrganizationStatus === 'pending') {
    return (
      <div data-organization-route-pending="true">
        <DashboardContentShell>
          <DashboardLoadingState />
        </DashboardContentShell>
      </div>
    );
  }

  return <NotFound />;
}
