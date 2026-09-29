import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Link2Off,
  MoreHorizontal,
  Play,
  RefreshCw,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';

import { ListLoadErrorState } from '@/components/dashboard/ListLoadErrorState';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DashboardContentShell,
  DashboardEmptyState,
  DashboardPageHeader,
  DashboardScrollArea,
  DashboardToolbar,
} from '@/components/dashboard/DashboardContentShell';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RUN_SHARE_LINK_DESCRIPTION, ShareLinkDialog } from '@/components/shared/ShareLinkDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  buildConsoleRunPath,
  buildConsoleTemplatePath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { isStaleRecordError } from '@/lib/editConflicts';
import { cn } from '@/lib/utils';
import { countRunTasks } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';
import { toast } from 'sonner';
import { useRunRevalidation } from '@/features/dashboard-runs/useRunRevalidation';
import { useRunsDashboardSharing } from '@/features/dashboard-runs/useRunsDashboardSharing';
import {
  buildRunTemplateLookup,
  filterDashboardRuns,
  findRunTemplate,
  type RunSourceTemplate,
  type RunStatusFilter as StatusFilter,
} from '@/features/dashboard-runs/runTemplateLookup';
import { getRunRowActions } from '@/features/dashboard-runs/runRowActions';
import type { ResourcePermissions } from '@/lib/organizationPermissions';

import { Link } from '@/components/navigation/Link';

interface RunsDashboardViewProps {
  runs: ChecklistRun[];
  // The public catalog and the active workspace's own list; see buildRunTemplateLookup.
  templates?: RunSourceTemplate[];
  workspaceTemplates?: RunSourceTemplate[];
  // The viewer's permissions on a run: its Organization role, or full for Personal runs.
  getRunPermissions: (run: ChecklistRun) => ResourcePermissions;
  onDeleteRun: (runId: string) => void | Promise<void>;
  onRevalidateRun?: (run: ChecklistRun) => void | Promise<void>;
  // Called once a share has made the run public (see createRunsDashboardShareUrl).
  onRunShared?: (runId: string) => void;
  // Reloads the runs list before a refused share shows its error (a run archived elsewhere).
  onShareFailed?: (error: unknown) => Promise<void>;
  /** Turns the run's share link off; the run becomes private and can be revalidated. */
  onStopSharingRun?: (runId: string) => Promise<void>;
  loading?: boolean;
  loadError?: unknown;
  onRetryLoad?: () => void;
}

// The status filter's options; the Select shows the chosen one's label.
const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All Runs',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

// Tasks only, as on the run page; the bar shows the run's overall progress.
const getTaskCounts = (run: ChecklistRun) => {
  const { tasksCompleted, tasksTotal } = countRunTasks(run.sections);
  return { completed: tasksCompleted, total: tasksTotal };
};

export function RunsDashboardView({
  runs,
  templates = [],
  workspaceTemplates,
  getRunPermissions,
  onDeleteRun,
  onRevalidateRun,
  onRunShared,
  onShareFailed,
  onStopSharingRun,
  loading = false,
  loadError,
  onRetryLoad = () => undefined,
}: RunsDashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [runToDelete, setRunToDelete] = useState<string | null>(null);
  const [isDeletingRun, setIsDeletingRun] = useState(false);
  // Each run stays busy until its own Revalidate finishes.
  const { isRevalidating, revalidate } = useRunRevalidation(onRevalidateRun);
  const { isShareDialogOpen, setIsShareDialogOpen, sharedLink, shareRun, stopSharing, stoppingShareRunId } =
    useRunsDashboardSharing({ runs, onRunShared, onShareFailed, onStopSharingRun });

  const inProgressCount = runs.filter((run) => run.status === 'in_progress').length;
  const completedCount = runs.filter((run) => run.status === 'completed').length;
  const templatesById = useMemo(
    () => buildRunTemplateLookup(templates, workspaceTemplates),
    [templates, workspaceTemplates],
  );

  const filteredRuns = useMemo(
    () => filterDashboardRuns(runs, templatesById, searchQuery, statusFilter),
    [runs, searchQuery, statusFilter, templatesById],
  );

  const confirmDeleteRun = async () => {
    if (!runToDelete) {
      return;
    }

    setIsDeletingRun(true);
    try {
      await onDeleteRun(runToDelete);
      toast.success('Run deleted');
      setRunToDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete run.',
      );
      // Deleted elsewhere: the list reloaded without it, so a retry could only fail again.
      if (isStaleRecordError(error)) setRunToDelete(null);
    } finally {
      setIsDeletingRun(false);
    }
  };

  return (
    <DashboardContentShell>
      <DashboardPageHeader
        title="My Runs"
        description={`${inProgressCount} in progress, ${completedCount} completed`}
      />

      <DashboardToolbar>
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search runs"
            placeholder="Search runs..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          items={STATUS_FILTER_LABELS}
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DashboardToolbar>

      <DashboardScrollArea>
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`run-skeleton-${index}`}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="h-10 w-10 shrink-0 rounded-full bg-secondary" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-56 rounded bg-secondary" />
                  <div className="h-3 w-36 rounded bg-secondary/80" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-20 rounded-full bg-secondary" />
                  <div className="h-5 w-12 rounded-full bg-secondary" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError && runs.length === 0 ? (
          <ListLoadErrorState error={loadError} listName="runs" onRetry={onRetryLoad} />
        ) : filteredRuns.length === 0 ? (
          <DashboardEmptyState
            icon={<Filter className="h-7 w-7" />}
            title="No runs found"
            description={
              searchQuery
                ? 'Try adjusting your search or filters'
                : 'Start a run from one of your templates'
            }
            action={
              !searchQuery ? (
              <Link
                href={buildPublicTemplatesPath()}
                className={buttonVariants()}
              >Browse the Template Library</Link>
              ) : null
            }
          />
        ) : (
          <div className="space-y-2">
            {filteredRuns.map((run) => {
              const isCompleted = run.status === 'completed';
              const { completed, total } = getTaskCounts(run);
              const template = findRunTemplate(templatesById, run.templateId);
              const actions = getRunRowActions(run, getRunPermissions(run));

              return (
                <div
                  key={run.id}
                  className="group grid gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-muted-foreground/30 sm:grid-cols-[auto_minmax(0,1fr)] xl:flex xl:items-center"
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      isCompleted ? 'bg-muted' : 'bg-primary/10',
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-foreground" />
                    ) : (
                      <Play className="h-5 w-5 text-primary" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={buildConsoleRunPath(run.id)}
                      className="text-left text-sm font-medium text-foreground hover:underline"
                    >
                      {run.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {template ? (
                        <Link
                          href={buildConsoleTemplatePath(template.id)}
                          className="font-medium text-foreground/80 hover:text-foreground hover:underline"
                        >
                          From {template.title}
                        </Link>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Started {formatDate(run.startedAt)}
                      </span>
                      {isCompleted && run.completedAt ? (
                        <span>Completed {formatDate(run.completedAt)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:col-start-2 xl:col-start-auto">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${run.progress}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs font-medium text-muted-foreground">
                        {completed}/{total}
                      </span>
                    </div>

                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        isCompleted
                          ? 'bg-secondary text-secondary-foreground'
                          : 'bg-primary/10 text-primary',
                      )}
                    >
                      {isCompleted ? 'Completed' : 'In Progress'}
                    </span>
                    {run.isStale ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        {run.isPublic ? 'Shared snapshot is out of date' : 'Needs revalidation'}
                      </span>
                    ) : run.isPublic ? (
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Shared
                      </span>
                    ) : null}
                  </div>

                  <div
                    // Hidden until hover only on devices that can hover: touch screens always show them.
                    className="flex flex-wrap items-center gap-2 opacity-100 transition-opacity xl:[@media(hover:hover)]:opacity-0 xl:group-hover:opacity-100 xl:focus-within:opacity-100"
                    data-run-actions="true"
                  >
                    {actions.canRevalidate && onRevalidateRun ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isRevalidating(run.id)}
                        onClick={() => void revalidate(run)}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        {isRevalidating(run.id) ? 'Revalidating...' : 'Revalidate'}
                      </Button>
                    ) : null}
                    {actions.canShare && run.isStale && run.isPublic && onStopSharingRun ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={stoppingShareRunId === run.id}
                        onClick={() => void stopSharing(run.id)}
                      >
                        <Link2Off className="mr-1.5 h-3.5 w-3.5" />
                        {stoppingShareRunId === run.id ? 'Stopping...' : 'Stop sharing to update'}
                      </Button>
                    ) : null}
                    {!isCompleted ? (
                      <Link href={buildConsoleRunPath(run.id)} className={buttonVariants({ size: 'sm' })}>
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                          Continue
                        </Link>
                    ) : (
                      <Link
                        href={buildConsoleRunPath(run.id)}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          View
                        </Link>
                    )}

                    {actions.canShare || actions.canDelete ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Run options" />}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {actions.canShare ? (
                            <DropdownMenuItem onClick={() => void shareRun(run.id)}>
                              <Share2 className="mr-2 h-4 w-4" />
                              Share Run
                            </DropdownMenuItem>
                          ) : null}
                          {actions.canShare && run.isPublic && onStopSharingRun ? (
                            <DropdownMenuItem
                              disabled={stoppingShareRunId === run.id}
                              onClick={() => void stopSharing(run.id)}
                            >
                              <Link2Off className="mr-2 h-4 w-4" />
                              Stop sharing
                            </DropdownMenuItem>
                          ) : null}
                          {actions.canShare && actions.canDelete ? <DropdownMenuSeparator /> : null}
                          {actions.canDelete ? (
                            <DropdownMenuItem
                              onClick={() => setRunToDelete(run.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardScrollArea>

      <Dialog
        open={runToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingRun) {
            setRunToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete run</DialogTitle>
            {/* Users see a delete. The API archives the run (ending its share link), and
                /dashboard/archive can restore it, so the dialog does not say it is permanent. */}
            <DialogDescription>
              Are you sure you want to delete this run?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isDeletingRun}
              onClick={() => setRunToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeletingRun}
              onClick={() => void confirmDeleteRun()}
            >
              {isDeletingRun ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ShareLinkDialog
        copiedMessage="Share link copied"
        description={RUN_SHARE_LINK_DESCRIPTION}
        onOpenChange={setIsShareDialogOpen}
        open={isShareDialogOpen}
        title="Share run"
        url={sharedLink?.url ?? ''}
      />
    </DashboardContentShell>
  );
}
