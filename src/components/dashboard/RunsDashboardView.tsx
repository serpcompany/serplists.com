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
  buildConsoleTemplatesPath,
  buildRunPath,
  buildRunUrl,
} from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { ChecklistRun } from '@/types/checklist';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'in_progress' | 'completed';

interface RunsDashboardViewProps {
  runs: ChecklistRun[];
  onDeleteRun: (runId: string) => void;
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
  onDeleteRun,
  loading = false,
}: RunsDashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [runToDelete, setRunToDelete] = useState<string | null>(null);

  const inProgressCount = runs.filter((run) => run.status === 'in_progress').length;
  const completedCount = runs.filter((run) => run.status === 'completed').length;

  const filteredRuns = useMemo(() => {
    const lowerSearch = searchQuery.toLowerCase();

    return runs
      .filter((run) => {
        const matchesSearch = run.title.toLowerCase().includes(lowerSearch);
        const matchesStatus =
          statusFilter === 'all' || run.status === statusFilter;

        return matchesSearch && matchesStatus;
      })
      .sort(
        (left, right) =>
          new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
      );
  }, [runs, searchQuery, statusFilter]);

  const shareRun = async (runId: string) => {
    const shareUrl = buildRunUrl(runId, window.location.origin);

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Run link copied');
    } catch {
      toast.success('Run link ready');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">My Runs</h1>
          <p className="text-sm text-muted-foreground">
            {inProgressCount} in progress, {completedCount} completed
          </p>
        </div>
      </header>

      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative flex-1 max-w-md">
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
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Runs</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto p-6">
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <Filter className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-sm font-medium text-foreground">
              No runs found
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {searchQuery
                ? 'Try adjusting your search or filters'
                : 'Start a run from one of your templates'}
            </p>
            {!searchQuery ? (
              <Button asChild>
                <Link to={buildConsoleTemplatesPath()}>Browse Templates</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRuns.map((run) => {
              const isCompleted = run.status === 'completed';
              const { completed, total } = getTaskCounts(run);

              return (
                <div
                  key={run.id}
                  className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-muted-foreground/30"
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
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Started {formatDate(run.startedAt)}
                      </span>
                      {isCompleted && run.completedAt ? (
                        <span>Completed {formatDate(run.completedAt)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
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

                  <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
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
      </div>

      <Dialog
        open={runToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
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
            <Button variant="outline" onClick={() => setRunToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (runToDelete) {
                  onDeleteRun(runToDelete);
                  toast.success('Run deleted');
                  setRunToDelete(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
