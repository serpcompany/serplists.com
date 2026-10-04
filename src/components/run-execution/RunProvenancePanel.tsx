import { useState, type ReactNode } from 'react';
import { ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { copyTextToClipboard } from '@/lib/clipboard';
import { RUN_ORIGIN_LABELS, runActorLabel, runProvenanceSummary } from '@/lib/runProvenance';
import { formatLocalDateTime } from '@/lib/utils/dbTimestamp';
import type { ChecklistRun, RunActor, RunProvenance } from '@/types/checklist';

type Detail = { label: string; value: ReactNode };

const NOT_RECORDED = 'Not recorded';

const actorDetail = (label: string, actor: RunActor | null | undefined, { onlyWhenSet = false } = {}): Detail[] => {
  if (actor === undefined || (onlyWhenSet && actor === null)) return [];
  return [{ label, value: runActorLabel(actor) ?? NOT_RECORDED }];
};

const timeDetail = (label: string, value: string | undefined): Detail[] =>
  value ? [{ label, value: <span className="tabular-nums">{formatLocalDateTime(value)}</span> }] : [];

const ownerLabel = (owner: NonNullable<RunProvenance['owner']>): string =>
  owner.type === 'personal' ? 'Personal' : owner.name ?? 'Organization';

function RunIdValue({ runId }: { runId: string }) {
  const copy = async () => {
    if (await copyTextToClipboard(runId)) toast.success('Run ID copied');
    else toast.error("Couldn't copy the run ID");
  };

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate font-mono text-xs">{runId}</span>
      <Button aria-label="Copy run ID" onClick={() => void copy()} size="icon-xs" variant="ghost">
        <Copy />
      </Button>
    </span>
  );
}

function runDetails(run: ChecklistRun): Detail[] {
  const provenance = run.provenance;
  const template = provenance?.template;
  return [
    { label: 'Run ID', value: <RunIdValue runId={run.id} /> },
    ...(template ? [{ label: 'Template', value: template.title ?? 'Unavailable' }] : []),
    { label: 'Template version', value: <span className="tabular-nums">{template?.version ?? run.templateVersion ?? 1}</span> },
    ...(provenance?.owner ? [{ label: 'Resource owner', value: ownerLabel(provenance.owner) }] : []),
    ...actorDetail('Created by', provenance?.createdBy),
    ...actorDetail('Started by', provenance?.startedBy),
    ...actorDetail('Assigned to', provenance?.assignedTo, { onlyWhenSet: true }),
    ...actorDetail('Completed by', provenance?.completedBy, { onlyWhenSet: true }),
    ...(provenance ? [{ label: 'Origin', value: RUN_ORIGIN_LABELS[provenance.origin] }] : []),
    ...(provenance?.origin === 'mcp' ? [{ label: 'Run Key', value: provenance.agentKeyName ?? NOT_RECORDED }] : []),
    ...(provenance?.origin === 'mcp' ? actorDetail('Authorized by', provenance.authorizedBy ?? null) : []),
    ...timeDetail('Created', run.createdAt),
    ...timeDetail('Started', run.startedAt),
    ...timeDetail('Updated', run.updatedAt),
    ...timeDetail('Completed', run.completedAt),
    ...(run.revision ? [{ label: 'Revision', value: <span className="tabular-nums">{run.revision}</span> }] : []),
  ];
}

export function RunProvenancePanel({ run }: { run: ChecklistRun }) {
  const [open, setOpen] = useState(false);
  const summary = runProvenanceSummary(run.provenance);
  const times = [
    `Started ${formatLocalDateTime(run.startedAt)}`,
    run.updatedAt ? `Updated ${formatLocalDateTime(run.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Collapsible className="flex flex-col gap-2" data-run-provenance="true" onOpenChange={setOpen} open={open}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {summary ? <span className="wrap-anywhere">{summary}</span> : null}
        <span className="tabular-nums">{times}</span>
        <CollapsibleTrigger render={<Button size="sm" variant="ghost" />}>
          {open ? 'Hide Details' : 'Show Details'}
          <ChevronDown data-icon="inline-end" className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {runDetails(run).map(({ label, value }) => (
            <div className="flex min-w-0 flex-col gap-0.5" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 wrap-anywhere">{value}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}
