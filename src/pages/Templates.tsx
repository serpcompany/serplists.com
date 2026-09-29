import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Grid3X3,
  List,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';

import { ListLoadErrorState } from '@/components/dashboard/ListLoadErrorState';
import { TemplateCard } from '@/components/dashboard/TemplateCard';
import { TemplateListItem } from '@/components/dashboard/TemplateListItem';
import {
  DashboardContentShell,
  DashboardEmptyState,
  DashboardPageHeader,
  DashboardScrollArea,
  DashboardToolbar,
} from '@/components/dashboard/DashboardContentShell';
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
  reportDashboardTemplateRunFailure,
  useDashboardTemplatesModel,
} from '@/features/dashboard-templates/useDashboardTemplatesModel';
import { usePageVisit } from '@/hooks/usePageVisit';
import { useRedirectPending } from '@/hooks/useRedirectPending';
import { useViewModePreference } from '@/hooks/useViewModePreference';
import { buildDefaultRunName, RUN_TITLE_MAX_LENGTH } from '@/lib/runs/runName';
import { compareTemplatesByRecent } from '@/lib/templates/templateRecency';
import {
  handleUpgradeRequiredForContext,
  navigateToLoginWithReturnPath,
} from '@/lib/access-flow';

type SortOption = 'recent' | 'alphabetical' | 'tasks';
type VisibilityFilter = 'all' | 'public' | 'private';

const Templates = () => {
  const model = useDashboardTemplatesModel();
  const navigate = useNavigate();
  const location = useLocation();
  const beginVisit = usePageVisit();
  const [runName, setRunName] = useState('');
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

  // A blank name submits this same default (see resolveRunName).
  const defaultRunName = model.selectedTemplate
    ? buildDefaultRunName(model.selectedTemplate.title)
    : '';

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

    setRunName('');
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

  const handleRunSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLaunchingRun) {
      return;
    }

    // Started before the request: a failure that arrives after the user has left
    // (Escape and a sidebar link, or Back) must not send them to sign-in or checkout.
    const visit = beginVisit();
    const result = await model.createRunFromTemplate(runName);

    if (result.kind === 'ok') {
      toast.success('Checklist run created');
      setRunName('');
      return;
    }

    await reportDashboardTemplateRunFailure(result, visit, {
      navigateToLogin: () => navigateToLoginWithReturnPath(navigate, location),
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
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  return (
    <DashboardContentShell>
      <DashboardPageHeader
        title="My Templates"
        description={`${model.templates.length} templates in your library`}
        actions={
          model.canCreateTemplate ? (
            <Button type="button" onClick={model.openCreateTemplate}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          ) : null
        }
      />

      <DashboardToolbar>
        <div className="relative flex-1 lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={filterVisibility}
          onValueChange={(value) => setFilterVisibility(value as VisibilityFilter)}
        >
          <SelectTrigger className="w-full lg:w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sortBy}
          onValueChange={(value) => setSortBy(value as SortOption)}
        >
          <SelectTrigger className="w-full lg:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="alphabetical">Alphabetical</SelectItem>
            <SelectItem value="tasks">Most Tasks</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center rounded-md border border-border">
          <Button
            aria-label="Show templates in grid view"
            aria-pressed={viewMode === 'grid'}
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 rounded-none rounded-l-md ${
              viewMode === 'grid' ? 'bg-secondary' : ''
            }`}
            onClick={() => setViewMode('grid')}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Show templates in list view"
            aria-pressed={viewMode === 'list'}
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 rounded-none rounded-r-md ${
              viewMode === 'list' ? 'bg-secondary' : ''
            }`}
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </DashboardToolbar>

      <DashboardScrollArea>
        <div className="space-y-8">
          {model.loading ? (
            <div className="text-sm text-muted-foreground">Loading templates...</div>
          ) : model.loadError ? (
            <ListLoadErrorState error={model.loadError} listName="templates" onRetry={model.retryLoad} />
          ) : filteredTemplates.length === 0 ? (
            <DashboardEmptyState
              icon={<SlidersHorizontal className="h-7 w-7" />}
              title="No templates found"
              description={
                searchQuery || filterVisibility !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Create your first template to get started'
              }
              action={
                model.canCreateTemplate && !searchQuery && filterVisibility === 'all' ? (
                <Button type="button" onClick={model.openCreateTemplate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Template
                </Button>
                ) : null
              }
            />
          ) : viewMode === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  canEdit={model.canEditTemplate}
                  onDelete={model.canEditTemplate ? setTemplateToDelete : undefined}
                  onStartRun={model.canRunTemplate ? model.openRunLauncher : undefined}
                  template={template}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTemplates.map((template) => (
                <TemplateListItem
                  key={template.id}
                  canEdit={model.canEditTemplate}
                  onDelete={model.canEditTemplate ? setTemplateToDelete : undefined}
                  onStartRun={model.canRunTemplate ? model.openRunLauncher : undefined}
                  template={template}
                />
              ))}
            </div>
          )}

        </div>
      </DashboardScrollArea>

      <Dialog open={model.runLauncherOpen} onOpenChange={handleRunDialogChange}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Start Run</DialogTitle>
            <DialogDescription>
              Pick one of your templates and launch a new run.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRunSubmit} className="space-y-6">
            <div className="space-y-2">
              <Select
                value={model.selectedTemplateId}
                onValueChange={model.selectRunTemplate}
              >
                <SelectTrigger id="run-template" className="rounded-md">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {model.templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Input
                id="run-name"
                value={runName}
                onChange={(event) => setRunName(event.target.value)}
                placeholder={defaultRunName}
                maxLength={RUN_TITLE_MAX_LENGTH}
                className="rounded-md"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleRunDialogChange(false)}
                disabled={isLaunchingRun}
                className="rounded-md"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!model.selectedTemplateId || isLaunchingRun}
                className="rounded-md"
              >
                {isLaunchingRun ? 'Creating...' : 'Start Run'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={templateToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingTemplate) {
            setTemplateToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This removes it
              from your library and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeletingTemplate}
              onClick={() => setTemplateToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletingTemplate}
              onClick={() => void handleDeleteTemplate()}
            >
              {isDeletingTemplate ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContentShell>
  );
};

export default Templates;
