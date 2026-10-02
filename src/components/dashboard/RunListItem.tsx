import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Link2Off,
  MoreHorizontal,
  Play,
  RefreshCw,
  Share2,
  Trash2,
  TriangleAlert,
} from 'lucide-react';

import { IconTile } from '@/components/layout/IconTile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item';
import { Progress } from '@/components/ui/progress';
import type { getRunRowActions } from '@/features/dashboard-runs/runRowActions';
import type { RunSourceTemplate } from '@/features/dashboard-runs/runTemplateLookup';
import { buildConsoleRunPath, buildConsoleTemplatePath } from '@/lib/routes';
import { countRunTasks } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

import { Link } from '@/components/navigation/Link';

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

type RunListItemProps = {
  actions: ReturnType<typeof getRunRowActions>;
  isRevalidating: boolean;
  isStoppingShare: boolean;
  onDelete: () => void;
  onRevalidate?: (() => void) | undefined;
  onShare: () => void;
  onStopSharing?: (() => void) | undefined;
  run: ChecklistRun;
  template?: RunSourceTemplate | null | undefined;
};

export function RunListItem({
  actions,
  isRevalidating,
  isStoppingShare,
  onDelete,
  onRevalidate,
  onShare,
  onStopSharing,
  run,
  template,
}: RunListItemProps) {
  const isCompleted = run.status === 'completed';
  const { tasksCompleted, tasksTotal } = countRunTasks(run.sections);
  const runPath = buildConsoleRunPath(run.id);

  return (
    <Item className="group" role="listitem" variant="outline">
      <IconTile className="self-start" size="sm">
        {isCompleted ? <CheckCircle2 /> : <Play />}
      </IconTile>

      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-2 wrap-anywhere">
          <Link
            href={runPath}
            className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {run.title}
          </Link>
        </ItemTitle>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {template ? (
            <Link
              href={buildConsoleTemplatePath(template.id)}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              From {template.title}
            </Link>
          ) : null}
          <span className="flex items-center gap-1">
            <Clock aria-hidden="true" className="size-3" />
            Started {formatDate(run.startedAt)}
          </span>
          {isCompleted && run.completedAt ? <span>Completed {formatDate(run.completedAt)}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Progress aria-label="Run progress" className="w-20" value={run.progress} />
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {tasksCompleted}/{tasksTotal}
          </span>
          <Badge variant={isCompleted ? 'default' : 'secondary'}>
            {isCompleted ? 'Completed' : 'In Progress'}
          </Badge>
          {run.isStale ? (
            <Badge variant="outline">
              <TriangleAlert data-icon="inline-start" />
              {run.isPublic ? 'Shared snapshot is out of date' : 'Needs revalidation'}
            </Badge>
          ) : run.isPublic ? (
            <Badge variant="secondary">Shared</Badge>
          ) : null}
        </div>
      </ItemContent>

      <ItemActions
        className="basis-full flex-wrap justify-end transition-opacity xl:basis-auto xl:[@media(hover:hover)]:opacity-0 xl:group-hover:opacity-100 xl:focus-within:opacity-100"
        data-run-actions="true"
      >
        {actions.canRevalidate && onRevalidate ? (
          <Button disabled={isRevalidating} onClick={onRevalidate} size="sm" variant="outline">
            <RefreshCw data-icon="inline-start" />
            {isRevalidating ? 'Revalidating...' : 'Revalidate'}
          </Button>
        ) : null}
        {actions.canShare && run.isStale && run.isPublic && onStopSharing ? (
          <Button disabled={isStoppingShare} onClick={onStopSharing} size="sm" variant="outline">
            <Link2Off data-icon="inline-start" />
            {isStoppingShare ? 'Stopping...' : 'Stop sharing to update'}
          </Button>
        ) : null}
        {!isCompleted ? (
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
            <DropdownMenuTrigger
              render={<Button aria-label="Run options" size="icon-sm" variant="ghost" />}
            >
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
      </ItemActions>
    </Item>
  );
}
