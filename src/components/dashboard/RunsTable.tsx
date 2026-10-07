import { CheckCircle2, Play } from 'lucide-react';

import {
  RunAttentionBadge,
  RunRowActions,
  RunStatusBadge,
  RunTaskProgress,
  type RunRowControls,
} from '@/components/dashboard/RunRowParts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { runTemplatePath, type RunSourceTemplate } from '@/features/dashboard-runs/runTemplateLookup';
import { ownerConsoleContext } from '@/lib/consoleRoutes';
import { buildConsoleRunPath } from '@/lib/routes';
import { RUN_ORIGIN_LABELS, runActorLabel } from '@/lib/runProvenance';
import { formatShortDate } from '@/lib/utils/dbTimestamp';
import type { ChecklistRun } from '@/types/checklist';

import { Link } from '@/components/navigation/Link';

const COLUMNS = ['Run', 'Template', 'Status', 'Progress', 'Started by', 'Origin', 'Started', 'Updated'];

const NOT_RECORDED = <span className="text-muted-foreground">—</span>;

type RunsTableProps = {
  controlsFor: (run: ChecklistRun) => RunRowControls;
  runs: ChecklistRun[];
  templateFor: (run: ChecklistRun) => RunSourceTemplate | undefined;
};

export function RunsTable({ controlsFor, runs, templateFor }: RunsTableProps) {
  return (
    <Table aria-label="Runs" data-runs-table="true">
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => {
          const template = templateFor(run);
          const runPath = buildConsoleRunPath(run.id, ownerConsoleContext(run.teamId));
          const startedBy = runActorLabel(run.provenance?.startedBy);

          return (
            <TableRow key={run.id}>
              <TableCell className="whitespace-normal">
                <div className="flex min-w-36 max-w-64 flex-col items-start gap-1">
                  <Link
                    href={runPath}
                    className="line-clamp-2 rounded-sm font-medium wrap-anywhere underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    title={run.title}
                  >
                    {run.title}
                  </Link>
                  <RunAttentionBadge run={run} />
                </div>
              </TableCell>
              <TableCell className="whitespace-normal">
                {template ? (
                  <Link
                    href={runTemplatePath(run, template)}
                    className="line-clamp-2 max-w-48 min-w-24 wrap-anywhere underline-offset-4 hover:underline"
                    title={template.title}
                  >
                    {template.title}
                  </Link>
                ) : (
                  NOT_RECORDED
                )}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5 text-muted-foreground [&_svg]:size-4">
                  {run.status === 'completed' ? <CheckCircle2 aria-hidden="true" /> : <Play aria-hidden="true" />}
                  <RunStatusBadge run={run} />
                </span>
              </TableCell>
              <TableCell>
                <RunTaskProgress run={run} />
              </TableCell>
              <TableCell>
                {startedBy ? (
                  <span className="block max-w-32 truncate" title={startedBy}>
                    {startedBy}
                  </span>
                ) : (
                  NOT_RECORDED
                )}
              </TableCell>
              <TableCell>{RUN_ORIGIN_LABELS[run.provenance?.origin ?? 'unknown']}</TableCell>
              <TableCell className="tabular-nums">{formatShortDate(run.startedAt)}</TableCell>
              <TableCell className="tabular-nums">{formatShortDate(run.updatedAt ?? run.startedAt)}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2" data-run-actions="true">
                  <RunRowActions {...controlsFor(run)} compact run={run} runPath={runPath} />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
