import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { RunsDashboardView } from '@/components/dashboard/RunsDashboardView';
import { useTemplateLists } from '@/contexts/TemplatesContext';

// The runs page (/dashboard/runs). Archived Templates and Runs live on /dashboard/archive.
const Dashboard = () => {
  const {
    templates,
    runs,
    runsLoading,
    runsError,
    refetchRuns,
    revalidateRun,
    deleteRun,
  } = useTemplateLists({ catalog: true, runs: true });
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      toast.success('Checkout complete.');
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  return (
    <RunsDashboardView
      runs={runs}
      templates={templates}
      onDeleteRun={deleteRun}
      onRevalidateRun={revalidateRun}
      loading={runsLoading}
      loadError={runsError}
      onRetryLoad={() => void refetchRuns()}
    />
  );
};

export default Dashboard;
