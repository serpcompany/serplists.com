import { CheckCircle2, Clock, Play } from 'lucide-react';

import {
  RunAttentionBadge,
  RunRowActions,
  RunStatusBadge,
  RunTaskProgress,
  type RunRowControls,
} from '@/components/dashboard/RunRowParts';
import { IconTile } from '@/components/layout/IconTile';
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item';
import { runTemplatePath, type RunSourceTemplate } from '@/features/dashboard-runs/runTemplateLookup';
import { ownerConsoleContext } from '@/lib/consoleRoutes';
import { buildConsoleRunPath } from '@/lib/routes';
import { formatShortDate } from '@/lib/utils/dbTimestamp';
import type { ChecklistRun } from '@/types/checklist';

import { Link } from '@/components/navigation/Link';

type RunListItemProps = RunRowControls & {
  run: ChecklistRun;
  template?: RunSourceTemplate | null | undefined;
};

export function RunListItem({ run, template, ...controls }: RunListItemProps) {
  const isCompleted = run.status === 'completed';
  const runPath = buildConsoleRunPath(run.id, ownerConsoleContext(run.teamId));

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
            <Link href={runTemplatePath(run, template)} className="font-medium text-foreground underline-offset-4 hover:underline">
              From {template.title}
            </Link>
          ) : null}
          <span className="flex items-center gap-1">
            <Clock aria-hidden="true" className="size-3" />
            Started {formatShortDate(run.startedAt)}
          </span>
          {isCompleted && run.completedAt ? <span>Completed {formatShortDate(run.completedAt)}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <RunTaskProgress run={run} />
          <RunStatusBadge run={run} />
          <RunAttentionBadge run={run} />
        </div>
      </ItemContent>

      <ItemActions
        className="basis-full flex-wrap justify-end transition-opacity xl:basis-auto xl:[@media(hover:hover)]:opacity-0 xl:group-hover:opacity-100 xl:focus-within:opacity-100"
        data-run-actions="true"
      >
        <RunRowActions {...controls} run={run} runPath={runPath} />
      </ItemActions>
    </Item>
  );
}
