import type { ReactNode } from 'react';

import { OrganizationRouteGate } from '@/components/workspace/OrganizationRouteGate';

export default function OrganizationLayout({ children }: { children: ReactNode }) {
  return <OrganizationRouteGate>{children}</OrganizationRouteGate>;
}
