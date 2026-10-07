import { ExternalLink, Link2Off, MoreHorizontal, Play, RefreshCw, Share2, Trash2, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { getRunRowActions } from '@/features/dashboard-runs/runRowActions';
import { countRunTasks } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

import { Link } from '@/components/navigation/Link';

export type RunRowControls = {
  actions: ReturnType<typeof getRunRowActions>;
  isRevalidating: boolean;
  isStoppingShare: boolean;
  onDelete: () => void;
  onRevalidate?: (() => void) | undefined;
  onShare: () => void;
  onStopSharing?: (() => void) | undefined;
};

export function RunTaskProgress({ run }: { run: ChecklistRun }) {
  const { tasksCompleted, tasksTotal } = countRunTasks(run.sections);
  return (
    <span className="flex items-center gap-2">
      <Progress aria-label="Run progress" className="w-20" value={run.progress} />
      <span className="text-xs font-medium text-muted-foreground tabular-nums">
        {tasksCompleted}/{tasksTotal}
      </span>
    </span>
  );
}

export function RunStatusBadge({ run }: { run: ChecklistRun }) {
  const isCompleted = run.status === 'completed';
  return <Badge variant={isCompleted ? 'default' : 'secondary'}>{isCompleted ? 'Completed' : 'In Progress'}</Badge>;
}

export function RunAttentionBadge({ run }: { run: ChecklistRun }) {
  if (run.isStale) {
    return (
      <Badge variant="outline">
        <TriangleAlert data-icon="inline-start" />
        {run.isPublic ? 'Shared snapshot is out of date' : 'Needs revalidation'}
      </Badge>
    );
  }
  return run.isPublic ? <Badge variant="secondary">Shared</Badge> : null;
}

export function RunRowActions({
  actions,
  isRevalidating,
  isStoppingShare,
  onDelete,
  onRevalidate,
  onShare,
  onStopSharing,
  run,
  runPath,
  compact = false,
}: RunRowControls & { run: ChecklistRun; runPath: string; compact?: boolean }) {
  const revalidateLabel = isRevalidating ? 'Revalidating...' : 'Revalidate';
  const stopSharingLabel = isStoppingShare ? 'Stopping...' : 'Stop sharing to update';
  return (
    <>
      {actions.canRevalidate && onRevalidate ? (
        compact ? (
          <Button aria-label={revalidateLabel} disabled={isRevalidating} onClick={onRevalidate} size="icon-sm" title={revalidateLabel} variant="outline">
            <RefreshCw />
          </Button>
        ) : (
          <Button disabled={isRevalidating} onClick={onRevalidate} size="sm" variant="outline">
            <RefreshCw data-icon="inline-start" />
            {revalidateLabel}
          </Button>
        )
      ) : null}
      {actions.canShare && run.isStale && run.isPublic && onStopSharing ? (
        compact ? (
          <Button aria-label={stopSharingLabel} disabled={isStoppingShare} onClick={onStopSharing} size="icon-sm" title={stopSharingLabel} variant="outline">
            <Link2Off />
          </Button>
        ) : (
          <Button disabled={isStoppingShare} onClick={onStopSharing} size="sm" variant="outline">
            <Link2Off data-icon="inline-start" />
            {stopSharingLabel}
          </Button>
        )
      ) : null}
      {run.status !== 'completed' ? (
        <Link href={runPath} className={buttonVariants({ size: 'sm' })}>
          <Play data-icon="inline-start" />
          Continue
        </Link>
      ) : (
        <Link href={runPath} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <ExternalLink data-icon="inline-start" />
          View
        </Link>
      )}

      {actions.canShare || actions.canDelete ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label="Run options" size="icon-sm" variant="ghost" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.canShare ? (
              <DropdownMenuItem onClick={onShare}>
                <Share2 />
                Share Run
              </DropdownMenuItem>
            ) : null}
            {actions.canShare && run.isPublic && onStopSharing ? (
              <DropdownMenuItem disabled={isStoppingShare} onClick={onStopSharing}>
                <Link2Off />
                Stop sharing
              </DropdownMenuItem>
            ) : null}
            {actions.canShare && actions.canDelete ? <DropdownMenuSeparator /> : null}
            {actions.canDelete ? (
              <DropdownMenuItem onClick={onDelete} variant="destructive">
                <Trash2 />
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
