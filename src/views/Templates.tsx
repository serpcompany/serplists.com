'use client';

import { useId, useMemo, useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { ListLoadErrorState } from '@/components/dashboard/ListLoadErrorState';
import { TemplateCard } from '@/components/dashboard/TemplateCard';
import { TemplateListItem } from '@/components/dashboard/TemplateListItem';
import {
  DashboardContentShell,
  DashboardEmptyState,
  DashboardPageHeader,
  DashboardPageBody,
} from '@/components/dashboard/DashboardContentShell';
import { CardGrid } from '@/components/layout/CardGrid';
import { SearchField } from '@/components/layout/SearchField';
import { Toolbar } from '@/components/layout/Toolbar';
import { ViewModeToggle } from '@/components/layout/ViewModeToggle';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { LabeledSelect } from '@/components/shared/LabeledSelect';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { ItemGroup } from '@/components/ui/item';
import { RunNameDialog } from '@/components/ui/run-name-dialog';
import {
  reportDashboardTemplateRunFailure,
  useDashboardTemplatesModel,
} from '@/features/dashboard-templates/useDashboardTemplatesModel';
import { usePageVisit } from '@/hooks/usePageVisit';
import { useRedirectPending } from '@/hooks/useRedirectPending';
import { useViewModePreference } from '@/hooks/useViewModePreference';
import { isStaleRecordError } from '@/lib/editConflicts';
import { countTemplateItems } from '@/lib/templates/templateItemCount';
import { compareTemplatesByRecent } from '@/lib/templates/templateRecency';
import { formatCount } from '@/lib/utils/pluralize';
import {
  handleUpgradeRequiredForContext,
  navigateToLoginWithReturnPath,
} from '@/lib/access-flow';
import { useAppRouter } from '@/lib/navigation/useAppRouter';

type SortOption = 'recent' | 'alphabetical' | 'tasks';
type VisibilityFilter = 'all' | 'public' | 'private';

const VISIBILITY_FILTER_LABELS: Record<VisibilityFilter, string> = {
  all: 'All',
  public: 'Public',
  private: 'Private',
};
const SORT_OPTION_LABELS: Record<SortOption, string> = {
  recent: 'Most Recent',
  alphabetical: 'Alphabetical',
  tasks: 'Most Tasks',
};

const Templates = () => {
  const model = useDashboardTemplatesModel();
  const router = useAppRouter();
  const beginVisit = usePageVisit();
  const [isStartingCheckout, setIsStartingCheckout] = useRedirectPending();
  const isLaunchingRun = model.isCreatingRun || isStartingCheckout;
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useViewModePreference({
    surface: 'dashboard-templates',
    userId: model.preferenceOwnerId,
  });
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [filterVisibility, setFilterVisibility] =
    useState<VisibilityFilter>('all');
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);
  const fieldId = useId();

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return model.templates
      .filter((template) => {
        const matchesSearch =
          normalizedQuery.length === 0 ||
          [template.title, template.description, ...(template.categories ?? [])]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery);
        const matchesVisibility =
          filterVisibility === 'all' ||
          (filterVisibility === 'public' && template.isPublic) ||
          (filterVisibility === 'private' && !template.isPublic);

        return matchesSearch && matchesVisibility;
      })
      .sort((left, right) => {
        if (sortBy === 'alphabetical') {
          return left.title.localeCompare(right.title);
        }

        if (sortBy === 'tasks') {
          return countTemplateItems(right) - countTemplateItems(left);
        }

        return compareTemplatesByRecent(left, right);
      });
  }, [filterVisibility, model.templates, searchQuery, sortBy]);

  const handleRunDialogChange = (open: boolean) => {
    if (open || isStartingCheckout) {
      return;
    }

    model.closeRunLauncher();
  };

  const startUpgrade = async (): Promise<boolean> => {
    setIsStartingCheckout(true);
    const redirecting = await handleUpgradeRequiredForContext({
      billingEnabled: true,
      isTeamWorkspace: Boolean(model.isTeamWorkspace),
    });
    if (!redirecting) {
      setIsStartingCheckout(false);
    }
    return redirecting;
  };

  const handleRunConfirm = async (runName: string) => {
    if (isLaunchingRun) {
      return;
    }

    const visit = beginVisit();
    const result = await model.createRunFromTemplate(runName);

    if (result.kind === 'ok') {
      toast.success('Checklist run created');
      return;
    }

    await reportDashboardTemplateRunFailure(result, visit, {
      navigateToLogin: () => navigateToLoginWithReturnPath(router.push),
      showError: (message) => toast.error(message),
      upgrade: startUpgrade,
    });
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) {
      return;
    }

    setIsDeletingTemplate(true);
    try {
      await model.removeTemplate(templateToDelete);
      toast.success('Template deleted');
      setTemplateToDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete template.',
      );
      if (isStaleRecordError(error)) setTemplateToDelete(null);
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  const templateCount = model.templates.length;
  const countDescription =
    model.loading || model.loadError
      ? undefined
      : `${formatCount(templateCount, 'template')} in your library`;

  const isFiltered = searchQuery !== '' || filterVisibility !== 'all';

  return (
    <DashboardContentShell>
      <DashboardPageHeader
        title="My Templates"
        description={countDescription}
        actions={
          model.canCreateTemplate ? (
            <Button type="button" onClick={model.openCreateTemplate}>
              <Plus data-icon="inline-start" />
              New Template
            </Button>
          ) : null
        }
      />

      <Toolbar>
        <Field className="sm:w-auto sm:flex-1 lg:max-w-md">
          <FieldLabel htmlFor={`${fieldId}-search`}>Search</FieldLabel>
          <SearchField
            groupClassName="h-8"
            id={`${fieldId}-search`}
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </Field>

        <div className="flex items-end gap-3">
          <LabeledSelect
            className="flex-1 sm:w-36 sm:flex-none"
            id={`${fieldId}-visibility`}
            label="Visibility"
            labels={VISIBILITY_FILTER_LABELS}
            value={filterVisibility}
            onValueChange={setFilterVisibility}
          />

          <LabeledSelect
            className="flex-1 sm:w-40 sm:flex-none"
            id={`${fieldId}-sort`}
            label="Sort by"
            labels={SORT_OPTION_LABELS}
            value={sortBy}
            onValueChange={setSortBy}
          />

          <ViewModeToggle onChange={setViewMode} value={viewMode} />
        </div>
      </Toolbar>

      <DashboardPageBody>
        {model.loading ? (
          <p className="text-sm text-muted-foreground">Loading templates...</p>
        ) : model.loadError ? (
          <ListLoadErrorState error={model.loadError} listName="templates" onRetry={model.retryLoad} />
        ) : filteredTemplates.length === 0 ? (
          <DashboardEmptyState
            icon={<SlidersHorizontal />}
            title="No templates found"
            description={
              isFiltered
                ? 'Try adjusting your search or filters'
                : 'Create your first template to get started'
            }
            action={
              model.canCreateTemplate && !isFiltered ? (
                <Button type="button" onClick={model.openCreateTemplate}>
                  <Plus data-icon="inline-start" />
                  Create Template
                </Button>
              ) : null
            }
          />
        ) : viewMode === 'grid' ? (
          <CardGrid>
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                canEdit={model.canEditTemplate}
                context={model.consoleContext}
                onDelete={model.canEditTemplate ? setTemplateToDelete : undefined}
                onStartRun={model.canRunTemplate ? model.openRunLauncher : undefined}
                template={template}
              />
            ))}
          </CardGrid>
        ) : (
          <ItemGroup className="gap-2">
            {filteredTemplates.map((template) => (
              <TemplateListItem
                key={template.id}
                canEdit={model.canEditTemplate}
                context={model.consoleContext}
                onDelete={model.canEditTemplate ? setTemplateToDelete : undefined}
                onStartRun={model.canRunTemplate ? model.openRunLauncher : undefined}
                template={template}
              />
            ))}
          </ItemGroup>
        )}
      </DashboardPageBody>

      <RunNameDialog
        open={model.runLauncherOpen}
        onOpenChange={handleRunDialogChange}
        templateTitle={model.selectedTemplate?.title ?? ''}
        onConfirm={handleRunConfirm}
        loading={isLaunchingRun}
      />

      <ConfirmDialog
        confirmLabel="Delete"
        description="Are you sure you want to delete this template?"
        onConfirm={() => void handleDeleteTemplate()}
        onOpenChange={(open) => {
          if (!open) setTemplateToDelete(null);
        }}
        open={templateToDelete !== null}
        pending={isDeletingTemplate}
        pendingLabel="Deleting..."
        title="Delete template"
      />
    </DashboardContentShell>
  );
};

export default Templates;
