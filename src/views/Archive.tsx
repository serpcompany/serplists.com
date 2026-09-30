'use client';

import { ArchiveRecoverySection } from '@/components/dashboard/ArchiveRecoverySection';
import {
  DashboardContentShell,
  DashboardPageHeader,
  DashboardPageBody,
} from '@/components/dashboard/DashboardContentShell';

// Deleting a Template or Run archives it; this page lists the active context's archived items
// and restores them.
const Archive = () => (
  <DashboardContentShell>
    <DashboardPageHeader
      title="Archive"
      description="Archived templates and runs. Restore one to put it back in your list."
    />
    <DashboardPageBody>
      <ArchiveRecoverySection />
    </DashboardPageBody>
  </DashboardContentShell>
);

export default Archive;
