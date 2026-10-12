'use client';

import type { ReactNode } from 'react';

import { DashboardContentShell, DashboardLoadingState } from '@/components/dashboard/DashboardContentShell';
import { useWorkspace } from '@/contexts/WorkspaceContext';

export function OrganizationRouteGate({ children, notFound }: { children: ReactNode; notFound: ReactNode }) {
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

  return <>{notFound}</>;
}
