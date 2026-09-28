import { useMemo, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Layers3,
  Play,
  PlusCircle,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ArchiveRecoverySection } from '@/components/dashboard/ArchiveRecoverySection';
import { RunsDashboardView } from '@/components/dashboard/RunsDashboardView';
import { UserTemplatesSection } from '@/components/templates/UserTemplatesSection';
import {
  DashboardMetricCard,
} from '@/components/dashboard/DashboardContentShell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplateLists, type ChecklistRun } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { averageProgress } from '@/lib/progress';
import {
  resolveConsoleSection,
  buildConsoleRunPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
} from '@/lib/routes';
import { getRunTitleError, RUN_TITLE_MAX } from '@/lib/schemas/nameLimits';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const {
    templates,
    allTemplates,
    templatesLoading,
    runs,
    runsLoading,
    updateRun,
    revalidateRun,
    markRunShared,
    deleteRun,
  } = useTemplateLists({ catalog: true, runs: true });
  const { getPermissions } = useWorkspace();
  const [runToDelete, setRunToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingRun, setIsDeletingRun] = useState(false);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [isSavingRunTitle, setIsSavingRunTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const workspaceTemplates = allTemplates ?? templates;

  const isRunsRoute = resolveConsoleSection(location.pathname) === 'runs';

  const templateLookup = useMemo(
    () => new Map(workspaceTemplates.map((template) => [template.id, template])),
    [workspaceTemplates],
  );
  const activeRuns = useMemo(
    () => runs.filter((run) => run.status === 'in_progress'),
    [runs],
  );
  const completedRuns = useMemo(
    () =>
      runs
        .filter((run) => run.status === 'completed')
        .sort(
          (left, right) =>
            new Date(right.completedAt || '').getTime() -
            new Date(left.completedAt || '').getTime(),
        ),
    [runs],
  );
  const userTemplates = useMemo(
    () =>
      workspaceTemplates.filter(
        (template) =>
          template.teamId ||
          (template.userId === user?.id && !template.id.startsWith('repo:')),
      ),
    [workspaceTemplates, user?.id],
  );

  const activeRunAverage = averageProgress(activeRuns.map((run) => run.progress));

  if (isRunsRoute) {
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
      />
    );
  }

  const handleDeleteRun = async () => {
    if (!runToDelete) {
      return;
    }

    setIsDeletingRun(true);
    try {
      await deleteRun(runToDelete);
      toast.success('Run deleted');
      setRunToDelete(null);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete run.',
      );
    } finally {
      setIsDeletingRun(false);
    }
  };

  const handleTitleEdit = (run: ChecklistRun) => {
    setEditingRunId(run.id);
    setEditTitle(run.title);
  };

  const handleTitleSave = async (runId: string) => {
    if (!editTitle.trim()) {
      return;
    }
    const titleError = getRunTitleError(editTitle);
    if (titleError) {
      toast.error(titleError);
      return;
    }

    const runToUpdate = runs.find((run) => run.id === runId);
    if (!runToUpdate) {
      return;
    }

    setIsSavingRunTitle(true);
    try {
      await updateRun({
        ...runToUpdate,
        title: editTitle.trim(),
      });
      toast.success('Run title updated');
      setEditingRunId(null);
      setEditTitle('');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update run title.',
      );
    } finally {
      setIsSavingRunTitle(false);
    }
  };

  const renderRunCard = (run: ChecklistRun, tone: 'active' | 'completed') => {
    const template = templateLookup.get(run.templateId);
    const templateTitle = template?.title || 'Unknown Template';
    const isCompleted = tone === 'completed';

    return (
      <div key={run.id} className="border border-border bg-card p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-secondary-foreground">
                {isCompleted ? 'Completed run' : 'Active run'}
              </span>
              {!isCompleted ? (
                <span className="text-sm text-muted-foreground">
                  {run.progress}% complete
                </span>
              ) : null}
            </div>

            <div className="mt-4">
              {editingRunId === run.id ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    maxLength={RUN_TITLE_MAX}
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleTitleSave(run.id);
                      }
                      if (event.key === 'Escape') {
                        setEditingRunId(null);
                        setEditTitle('');
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      disabled={isSavingRunTitle}
                      onClick={() => void handleTitleSave(run.id)}
                      className="rounded-md"
                    >
                      {isSavingRunTitle ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSavingRunTitle}
                      onClick={() => {
                        setEditingRunId(null);
                        setEditTitle('');
                      }}
                      className="rounded-md"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleTitleEdit(run)}
                  className="text-left text-2xl font-semibold text-foreground transition hover:text-foreground/80"
                >
                  {run.title}
                </button>
              )}
            </div>

            <div className="mt-2 text-sm text-muted-foreground">
              From template:{' '}
              <Link
                to={buildConsoleTemplatePath(run.templateId)}
                className="font-medium text-foreground hover:text-foreground/80"
              >
                {templateTitle}
              </Link>
            </div>

            {!isCompleted ? (
              <div className="mt-4 space-y-3">
                <Progress value={run.progress} className="h-2" />
                <div className="text-sm text-muted-foreground">
                  Keep going from where you left off.
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">
                Completed{' '}
                {run.completedAt
                  ? new Date(run.completedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'recently'}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRunToDelete(run.id);
                setIsDeleteDialogOpen(true);
              }}
              className="rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <Button asChild className="rounded-md">
              <Link to={buildConsoleRunPath(run.id)}>
                {isCompleted ? 'View details' : 'Continue'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border-b border-border pb-6">
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground">
            <CheckCircle2 className="h-4 w-4" />
            {isRunsRoute ? 'Run management' : 'Operational home'}
          </div>
          <h1 className="mt-6 text-4xl font-semibold text-foreground">
            {isRunsRoute
              ? 'Track active checklist runs'
              : 'Keep work moving from the console'}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            {isRunsRoute
              ? 'Review in-progress work, rename runs as they evolve, and reopen completed work when you need the details.'
              : 'The console keeps private templates and active runs in one operational surface so teams can scan, update, and continue execution quickly.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <DashboardMetricCard label="Active runs" value={activeRuns.length} />
          <DashboardMetricCard
            label="Completed runs"
            value={completedRuns.length}
          />
          <DashboardMetricCard
            icon={<Layers3 className="h-4 w-4" />}
            label="Avg progress"
            value={`${activeRunAverage}%`}
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild className="rounded-md">
          <Link to={buildConsoleTemplateCreatePath()}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New template
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-md">
          <Link to={buildConsoleTemplatesPath()}>
            <Play className="mr-2 h-4 w-4" />
            Start a new run
          </Link>
        </Button>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-foreground">
            Active runs
          </h2>
        </div>

        {runsLoading ? (
          <div className="border bg-card p-6">
            <LoadingSpinner message="Loading runs..." />
          </div>
        ) : activeRuns.length > 0 ? (
          <div className="space-y-4">
            {activeRuns.map((run) => renderRunCard(run, 'active'))}
          </div>
        ) : (
          <div className="border bg-card p-6 text-center">
            <h3 className="text-xl font-semibold text-foreground">
              No active runs
            </h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Start a run from one of your templates and it will appear here.
            </p>
            <Button asChild variant="outline" className="mt-6 rounded-md">
              <Link to={buildConsoleTemplatesPath()}>Open templates</Link>
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">
          Completed runs
        </h2>
        {runsLoading ? (
          <div className="border bg-card p-6">
            <LoadingSpinner message="Loading completed runs..." />
          </div>
        ) : completedRuns.length > 0 ? (
          <div className="space-y-4">
            {completedRuns.map((run) => renderRunCard(run, 'completed'))}
          </div>
        ) : (
          <div className="border bg-card p-6 text-center">
            <h3 className="text-xl font-semibold text-foreground">
              No completed runs yet
            </h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Completed work will appear here once you finish an active run.
            </p>
          </div>
        )}
      </section>

      {!isRunsRoute ? (
        <section>
          <UserTemplatesSection
            title="Recent templates"
            description="Quick access to your newest template packs."
            headingLevel="h2"
            templates={userTemplates}
            loading={templatesLoading}
            maxItems={3}
            onViewTemplate={(id) => navigate(buildConsoleTemplatePath(id))}
          />
        </section>
      ) : null}

      {!isRunsRoute ? <ArchiveRecoverySection /> : null}

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete run</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this run? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isDeletingRun}
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeletingRun}
              onClick={() => void handleDeleteRun()}
            >
              {isDeletingRun ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
