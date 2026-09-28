import { RunsDashboardView } from '@/components/dashboard/RunsDashboardView';
import { useTemplateLists } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';

// The runs page (/dashboard/runs). Archived Templates and Runs live on /dashboard/archive.
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
  // Each run follows the viewer's role in the Organization that owns it.
  const { getPermissions } = useWorkspace();

  return (
    <RunsDashboardView
      runs={runs}
      templates={templates}
      workspaceTemplates={allTemplates}
      getRunPermissions={(run) => getPermissions(run.teamId)}
      onDeleteRun={deleteRun}
      onRevalidateRun={revalidateRun}
      onRunShared={markRunShared}
      loading={runsLoading}
      loadError={runsError}
      onRetryLoad={() => void refetchRuns()}
    />
  );
};

export default Dashboard;
