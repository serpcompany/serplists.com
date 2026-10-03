import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Filter, ListChecks } from 'lucide-react';
import { toast } from 'sonner';

import { ListLoadErrorState } from '@/components/dashboard/ListLoadErrorState';
import { RunListItem } from '@/components/dashboard/RunListItem';
import {
  DashboardContentShell,
  DashboardEmptyState,
  DashboardPageBody,
  DashboardPageHeader,
} from '@/components/dashboard/DashboardContentShell';
import { SearchField } from '@/components/layout/SearchField';
import { Toolbar } from '@/components/layout/Toolbar';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { LabeledSelect } from '@/components/shared/LabeledSelect';
import { RUN_SHARE_LINK_DESCRIPTION } from '@/components/shared/runShareLinkDescription';
import { ShareLinkDialog } from '@/components/shared/ShareLinkDialog';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Field, FieldLabel } from '@/components/ui/field';
import { Item, ItemContent, ItemGroup } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { buildPublicTemplatesPath } from '@/lib/routes';
import { replaceCurrentUrl } from '@/lib/navigation/replaceCurrentUrl';
import { isStaleRecordError } from '@/lib/editConflicts';
import type { ChecklistRun } from '@/types/checklist';
import { useRunRevalidation } from '@/features/dashboard-runs/useRunRevalidation';
import { useRunsDashboardSharing } from '@/features/dashboard-runs/useRunsDashboardSharing';
import {
  buildRunTemplateLookup,
  filterDashboardRuns,
  findRunTemplate,
  runTemplateFilterOptions,
  type RunSourceTemplate,
  type RunStatusFilter as StatusFilter,
} from '@/features/dashboard-runs/runTemplateLookup';
import { buildRunsTemplateFilterUrl, readRunsTemplateFilter } from '@/features/dashboard-runs/runsTemplateFilter';
import { getRunRowActions } from '@/features/dashboard-runs/runRowActions';
import type { ResourcePermissions } from '@/lib/organizationPermissions';

import { Link } from '@/components/navigation/Link';

interface RunsDashboardViewProps {
  runs: ChecklistRun[];
  templates?: RunSourceTemplate[];
  workspaceTemplates?: RunSourceTemplate[];
  getRunPermissions: (run: ChecklistRun) => ResourcePermissions;
  onDeleteRun: (runId: string) => void | Promise<void>;
  onRevalidateRun?: (run: ChecklistRun) => void | Promise<void>;
  onRunShared?: ((runId: string) => void) | undefined;
  onShareFailed?: ((error: unknown) => Promise<void>) | undefined;
  onStopSharingRun?: ((runId: string) => Promise<void>) | undefined;
  loading?: boolean;
  loadError?: unknown;
  onRetryLoad?: () => void;
}

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All Runs',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const ALL_TEMPLATES = 'all';
const UNKNOWN_TEMPLATE_LABEL = 'Unknown template';

const setTemplateFilter = (templateId: string | null) =>
  replaceCurrentUrl(buildRunsTemplateFilterUrl(window.location, templateId));

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
  const templateFilter = readRunsTemplateFilter(useSearchParams());
  const [runToDelete, setRunToDelete] = useState<string | null>(null);
  const [isDeletingRun, setIsDeletingRun] = useState(false);
  const fieldId = useId();
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
    () => filterDashboardRuns(runs, templatesById, searchQuery, statusFilter, templateFilter),
    [runs, searchQuery, statusFilter, templateFilter, templatesById],
  );
  const templateLabels = useMemo(
    (): Record<string, string> => ({
      [ALL_TEMPLATES]: 'All templates',
      ...Object.fromEntries(
        runTemplateFilterOptions(runs, templatesById, templateFilter).map((option) => [
          option.id,
          option.title ?? UNKNOWN_TEMPLATE_LABEL,
        ]),
      ),
    }),
    [runs, templateFilter, templatesById],
  );
  const filterTemplateTitle = templateFilter ? templateLabels[templateFilter] : undefined;
  const templateHasNoRuns = templateFilter !== null && !runs.some((run) => run.templateId === templateFilter);
  const isFiltering = Boolean(searchQuery) || statusFilter !== 'all' || templateFilter !== null;

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

      <Toolbar>
        <Field className="sm:w-auto sm:flex-1 lg:max-w-md">
          <FieldLabel htmlFor={`${fieldId}-search`}>Search</FieldLabel>
          <SearchField
            groupClassName="h-8"
            id={`${fieldId}-search`}
            placeholder="Search runs..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </Field>

        <LabeledSelect
          className="sm:w-56"
          id={`${fieldId}-template`}
          label="Template"
          labels={templateLabels}
          onValueChange={(value) => setTemplateFilter(value === ALL_TEMPLATES ? null : value)}
          value={templateFilter ?? ALL_TEMPLATES}
        />

        <LabeledSelect
          className="sm:w-40"
          id={`${fieldId}-status`}
          label="Status"
          labels={STATUS_FILTER_LABELS}
          onValueChange={setStatusFilter}
          value={statusFilter}
        />
      </Toolbar>

      <DashboardPageBody>
        {loading ? (
          <ItemGroup aria-busy="true" className="gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Item key={`run-skeleton-${index}`} role="listitem" variant="outline">
                <Skeleton className="size-8 rounded-lg" />
                <ItemContent>
                  <Skeleton className="h-4 w-56 max-w-full" />
                  <Skeleton className="h-3 w-36 max-w-full" />
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        ) : loadError && runs.length === 0 ? (
          <ListLoadErrorState error={loadError} listName="runs" onRetry={onRetryLoad} />
        ) : filteredRuns.length === 0 && templateHasNoRuns ? (
          <DashboardEmptyState
            icon={<ListChecks />}
            title="No runs of this template yet"
            description={`Runs started from ${filterTemplateTitle ?? 'this template'} appear here.`}
            action={
              <Button onClick={() => setTemplateFilter(null)} variant="outline">
                Show all runs
              </Button>
            }
          />
        ) : filteredRuns.length === 0 ? (
          <DashboardEmptyState
            icon={<Filter />}
            title="No runs found"
            description={
              isFiltering
                ? 'Try adjusting your search or filters'
                : 'Start a run from one of your templates'
            }
            action={
              !isFiltering ? (
                <Link href={buildPublicTemplatesPath()} className={buttonVariants()}>
                  Browse the Template Library
                </Link>
              ) : null
            }
          />
        ) : (
          <ItemGroup className="gap-2">
            {filteredRuns.map((run) => (
              <RunListItem
                key={run.id}
                actions={getRunRowActions(run, getRunPermissions(run))}
                isRevalidating={isRevalidating(run.id)}
                isStoppingShare={stoppingShareRunId === run.id}
                onDelete={() => setRunToDelete(run.id)}
                onRevalidate={onRevalidateRun ? () => void revalidate(run) : undefined}
                onShare={() => void shareRun(run.id)}
                onStopSharing={onStopSharingRun ? () => void stopSharing(run.id) : undefined}
                run={run}
                template={findRunTemplate(templatesById, run.templateId)}
              />
            ))}
          </ItemGroup>
        )}
      </DashboardPageBody>

      <ConfirmDialog
        confirmLabel="Delete"
        description="Are you sure you want to delete this run?"
        onConfirm={() => void confirmDeleteRun()}
        onOpenChange={(open) => {
          if (!open) setRunToDelete(null);
        }}
        open={runToDelete !== null}
        pending={isDeletingRun}
        pendingLabel="Deleting..."
        title="Delete run"
      />
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
