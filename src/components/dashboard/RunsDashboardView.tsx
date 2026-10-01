import { useId, useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
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
import { RUN_SHARE_LINK_DESCRIPTION, ShareLinkDialog } from '@/components/shared/ShareLinkDialog';
import { buttonVariants } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Item, ItemContent, ItemGroup } from '@/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { buildPublicTemplatesPath } from '@/lib/routes';
import { isStaleRecordError } from '@/lib/editConflicts';
import type { ChecklistRun } from '@/types/checklist';
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
  templates?: RunSourceTemplate[];
  workspaceTemplates?: RunSourceTemplate[];
  getRunPermissions: (run: ChecklistRun) => ResourcePermissions;
  onDeleteRun: (runId: string) => void | Promise<void>;
  onRevalidateRun?: (run: ChecklistRun) => void | Promise<void>;
  onRunShared?: (runId: string) => void;
  onShareFailed?: (error: unknown) => Promise<void>;
  onStopSharingRun?: (runId: string) => Promise<void>;
  loading?: boolean;
  loadError?: unknown;
  onRetryLoad?: () => void;
}

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All Runs',
  in_progress: 'In Progress',
  completed: 'Completed',
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

        <Field className="sm:w-40">
          <FieldLabel htmlFor={`${fieldId}-status`}>Status</FieldLabel>
          <Select
            items={STATUS_FILTER_LABELS}
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="w-full" id={`${fieldId}-status`}>
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
        </Field>
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
        ) : filteredRuns.length === 0 ? (
          <DashboardEmptyState
            icon={<Filter />}
            title="No runs found"
            description={
              searchQuery
                ? 'Try adjusting your search or filters'
                : 'Start a run from one of your templates'
            }
            action={
              !searchQuery ? (
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
