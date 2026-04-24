import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  MoreHorizontal,
  Play,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
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
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
  buildRunPath,
} from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';
import { toast } from 'sonner';
import { createRunsDashboardShareUrl } from '@/features/dashboard-runs/shareRun';

type StatusFilter = 'all' | 'in_progress' | 'completed';

interface RunsDashboardViewProps {
  runs: ChecklistRun[];
  templates?: Pick<ChecklistTemplate, 'id' | 'ownerProfile' | 'title'>[];
  onDeleteRun: (runId: string) => void | Promise<void>;
  loading?: boolean;
}

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const getTaskCounts = (run: ChecklistRun) =>
  run.sections.reduce(
    (acc, section) => {
      const completed = section.items.filter((item) => item.isCompleted).length;
      return {
        completed: acc.completed + completed,
        total: acc.total + section.items.length,
      };
    },
    { completed: 0, total: 0 },
  );

export function RunsDashboardView({
  runs,
  templates = [],
  onDeleteRun,
  loading = false,
}: RunsDashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [runToDelete, setRunToDelete] = useState<string | null>(null);
  const [isDeletingRun, setIsDeletingRun] = useState(false);

  const inProgressCount = runs.filter((run) => run.status === 'in_progress').length;
  const completedCount = runs.filter((run) => run.status === 'completed').length;
  const templatesById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  );

  const filteredRuns = useMemo(() => {
    const lowerSearch = searchQuery.toLowerCase();

    return runs
      .filter((run) => {
        const template = templatesById.get(run.templateId);
        const matchesSearch = [
          run.title,
          run.status,
          template?.title ?? '',
          template?.ownerProfile?.username ?? '',
          template?.ownerProfile?.full_name ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(lowerSearch);
        const matchesStatus =
          statusFilter === 'all' || run.status === statusFilter;

        return matchesSearch && matchesStatus;
      })
      .sort(
        (left, right) =>
          new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
      );
  }, [runs, searchQuery, statusFilter, templatesById]);

  const shareRun = async (runId: string) => {
    try {
      const shareUrl = await createRunsDashboardShareUrl(
        runId,
        window.location.origin,
      );
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied');
    } catch {
      toast.error('Failed to create share link');
    }
  };

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
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Runs</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
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
              <Button asChild>
                <Link to={buildConsoleTemplatesPath()}>Browse Templates</Link>
              </Button>
              ) : null
            }
          />
        ) : (
          <div className="space-y-2">
            {filteredRuns.map((run) => {
              const isCompleted = run.status === 'completed';
              const { completed, total } = getTaskCounts(run);
              const template = templatesById.get(run.templateId);

              return (
                <div
                  key={run.id}
                  className="group grid gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-muted-foreground/30 sm:grid-cols-[auto_minmax(0,1fr)] xl:flex xl:items-center"
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      isCompleted ? 'bg-success/10' : 'bg-primary/10',
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <Play className="h-5 w-5 text-primary" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link
                      to={buildRunPath(run.id)}
                      className="text-left text-sm font-medium text-foreground hover:underline"
                    >
                      {run.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {template ? (
                        <Link
                          to={buildConsoleTemplatePath(template.id)}
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
                          className={cn(
                            'h-full transition-all duration-300',
                            isCompleted ? 'bg-success' : 'bg-primary',
                          )}
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
                          ? 'bg-success/10 text-success'
                          : 'bg-primary/10 text-primary',
                      )}
                    >
                      {isCompleted ? 'Completed' : 'In Progress'}
                    </span>
                  </div>

                  <div
                    className="flex flex-wrap items-center gap-2 opacity-100 transition-opacity xl:opacity-0 xl:group-hover:opacity-100 xl:focus-within:opacity-100"
                    data-run-actions="true"
                  >
                    {!isCompleted ? (
                      <Button asChild size="sm">
                        <Link to={buildRunPath(run.id)}>
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                          Continue
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" asChild>
                        <Link to={buildRunPath(run.id)}>
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          View
                        </Link>
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Run options"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => shareRun(run.id)}>
                          <Share2 className="mr-2 h-4 w-4" />
                          Share Run
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setRunToDelete(run.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
            <DialogDescription>
              Are you sure you want to delete this run? This action cannot be
              undone.
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
    </DashboardContentShell>
  );
}
