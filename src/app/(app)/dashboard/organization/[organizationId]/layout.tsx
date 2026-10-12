import type { ReactNode } from 'react';

import { OrganizationRouteGate } from '@/components/workspace/OrganizationRouteGate';
import NotFound from '@/views/NotFound';

export default function OrganizationLayout({ children }: { children: ReactNode }) {
  return <OrganizationRouteGate notFound={<NotFound />}>{children}</OrganizationRouteGate>;
}
