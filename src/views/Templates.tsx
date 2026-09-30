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
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { ItemGroup } from '@/components/ui/item';
import { RunNameDialog } from '@/components/ui/run-name-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  reportDashboardTemplateRunFailure,
  useDashboardTemplatesModel,
} from '@/features/dashboard-templates/useDashboardTemplatesModel';
import { usePageVisit } from '@/hooks/usePageVisit';
import { useRedirectPending } from '@/hooks/useRedirectPending';
import { useViewModePreference } from '@/hooks/useViewModePreference';
import { isStaleRecordError } from '@/lib/editConflicts';
import { compareTemplatesByRecent } from '@/lib/templates/templateRecency';
import { formatCount } from '@/lib/utils/pluralize';
import {
  handleUpgradeRequiredForContext,
  navigateToLoginWithReturnPath,
} from '@/lib/access-flow';
import { useAppRouter } from '@/lib/navigation/useAppRouter';

type SortOption = 'recent' | 'alphabetical' | 'tasks';
type VisibilityFilter = 'all' | 'public' | 'private';

// The filter and sort options; each Select shows the chosen one's label.
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
  // Set until the browser leaves for checkout; Back from Stripe clears it, so the
  // restored dialog can be closed or submitted again.
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
          const leftTasks = left.sections.reduce(
            (count, section) => count + section.items.length,
            0,
          );
          const rightTasks = right.sections.reduce(
            (count, section) => count + section.items.length,
            0,
          );

          return rightTasks - leftTasks;
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
    // Keep the dialog busy until the checkout redirect starts, so a second
    // click cannot open a second checkout session.
    setIsStartingCheckout(true);
    // No billing-status fetch here: a disabled billing config answers checkout
    // with 503 billing_unavailable, which startBillingCheckout reports.
    const redirecting = await handleUpgradeRequiredForContext({
      billingEnabled: true,
      isTeamWorkspace: Boolean(model.isTeamWorkspace),
    });
    if (!redirecting) {
      setIsStartingCheckout(false);
    }
    return redirecting;
  };

  // The dialog's name, or the default it showed when left blank.
  const handleRunConfirm = async (runName: string) => {
    if (isLaunchingRun) {
      return;
    }

    // Started before the request: a failure that arrives after the user has left
    // (Escape and a sidebar link, or Back) must not send them to sign-in or checkout.
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
      // Deleted elsewhere: the list reloaded without it, so a retry could only fail again.
      if (isStaleRecordError(error)) setTemplateToDelete(null);
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  // No count until the list has loaded: a loading or failed list is not an empty one.
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
          <Field className="flex-1 sm:w-36 sm:flex-none">
            <FieldLabel htmlFor={`${fieldId}-visibility`}>Visibility</FieldLabel>
            <Select
              items={VISIBILITY_FILTER_LABELS}
              value={filterVisibility}
              onValueChange={(value) => setFilterVisibility(value as VisibilityFilter)}
            >
              <SelectTrigger className="w-full" id={`${fieldId}-visibility`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(VISIBILITY_FILTER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field className="flex-1 sm:w-40 sm:flex-none">
            <FieldLabel htmlFor={`${fieldId}-sort`}>Sort by</FieldLabel>
            <Select
              items={SORT_OPTION_LABELS}
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortOption)}
            >
              <SelectTrigger className="w-full" id={`${fieldId}-sort`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORT_OPTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

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

      {/* Users see a delete. The API archives the template (making it private), and
          /dashboard/archive can restore it, so the dialog does not say it is permanent. */}
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
