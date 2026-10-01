'use client';

import { RunsDashboardView } from '@/components/dashboard/RunsDashboardView';
import { useTemplateLists } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useRunSharing } from '@/features/dashboard-runs/useRunSharing';

const Dashboard = () => {
  const {
    templates,
    allTemplates,
    runs,
    runsLoading,
    runsError,
    refetchRuns,
    revalidateRun,
    markRunShared,
    deleteRun,
  } = useTemplateLists({ catalog: true, runs: true });
  const { getPermissions } = useWorkspace();
  const { refreshAfterShareFailure, stopSharingRun } = useRunSharing();

  return (
    <RunsDashboardView
      runs={runs}
      templates={templates}
      workspaceTemplates={allTemplates}
      getRunPermissions={(run) => getPermissions(run.teamId)}
      onDeleteRun={deleteRun}
      onRevalidateRun={revalidateRun}
      onRunShared={markRunShared}
      onShareFailed={refreshAfterShareFailure}
      onStopSharingRun={stopSharingRun}
      loading={runsLoading}
      loadError={runsError}
      onRetryLoad={() => void refetchRuns()}
    />
  );
};

export default Dashboard;
