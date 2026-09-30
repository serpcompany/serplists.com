'use client';

import { ArchiveRecoverySection } from '@/components/dashboard/ArchiveRecoverySection';
import { DashboardContentShell } from '@/components/dashboard/DashboardContentShell';

// Deleting a Template or Run archives it; this page lists the active context's archived items
// and restores them.
const Archive = () => (
  <DashboardContentShell>
    <ArchiveRecoverySection />
  </DashboardContentShell>
);

export default Archive;
