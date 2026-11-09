'use client';

import { BillingSection } from '@/components/account/BillingSection';
import { LeaveOrganizationCard } from '@/components/account/LeaveOrganizationCard';
import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { Link } from '@/components/navigation/Link';
import {
  DashboardContentShell,
  DashboardPageBody,
  DashboardPageHeader,
} from '@/components/dashboard/DashboardContentShell';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { isPersonalRunMcpUiEnabled } from '@/env';
import { buildConsoleSettingsPath, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';

export default function OrganizationSettings() {
  const { activeWorkspace } = useWorkspace();

  if (activeWorkspace.type !== 'team') {
    return null;
  }

  const { name } = activeWorkspace;
  const accountControls = isPersonalRunMcpUiEnabled()
    ? 'Your profile, security and Run Keys are in'
    : 'Your profile and security are in';

  return (
    <DashboardContentShell width="narrow">
      <DashboardPageHeader
        title={`${name} Settings`}
        description={
          <>
            {`${name}'s billing, members and invites.`}
            <br />
            {accountControls}{' '}
            <Link
              className="font-medium text-primary underline underline-offset-4"
              href={buildConsoleSettingsPath(PERSONAL_CONSOLE)}
            >
              Account Settings
            </Link>
            .
          </>
        }
      />
      <DashboardPageBody>
        <BillingSection />

        <TeamSettingsSection />

        <LeaveOrganizationCard />
      </DashboardPageBody>
    </DashboardContentShell>
  );
}
