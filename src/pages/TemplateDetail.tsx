import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Eye,
  Globe,
  History,
  ListChecks,
  Lock,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Share2,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { Switch } from '@/components/ui/switch';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ShareLinkDialog } from '@/components/shared/ShareLinkDialog';
import {
  DashboardContentShell,
  DashboardPageHeader,
  DashboardScrollArea,
} from '@/components/dashboard/DashboardContentShell';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplateLists } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useTemplateDetailModel } from '@/features/template-detail/useTemplateDetailModel';
import {
  navigateToLoginWithReturnPath,
  startBillingCheckout,
} from '@/lib/access-flow';
import type {
  TemplateHistoryEvent,
  TemplateHistoryVersion,
} from '@/lib/api';
import {
  buildConsoleRunPath,
  buildConsoleTemplateEditPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
} from '@/lib/routes';
import { normalizeDisplayText } from '@/lib/utils/markdownDisplay';
import { formatAuditAction, TEMPLATE_HISTORY_LABELS } from '@/lib/auditLabels';
import { getTemplateActionPermissions } from '@/lib/organizationPermissions';
import { isRepoTemplate } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate, TemplateSavePayload } from '@/types/checklist';

type TemplateMetrics = {
  copyCount?: number;
  runCount?: number;
  viewCount?: number;
};

const formatDate = (value?: string): string => {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleDateString('en-US');
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatHistoryAction = (
  action: string,
  version?: number,
): string => {
  const label = formatAuditAction(TEMPLATE_HISTORY_LABELS, action);
  return typeof version === 'number' ? `${label} v${version}` : label;
};

const getHistoryActorName = (
  actor?: TemplateHistoryEvent['actor'] | TemplateHistoryVersion['actor'],
): string => actor?.name || actor?.username || actor?.email || 'Unknown user';

const isHistoryVersion = (
  entry: TemplateHistoryEvent | TemplateHistoryVersion,
): entry is TemplateHistoryVersion => 'version' in entry;

const buildTemplateSavePayload = (
  template: ChecklistTemplate,
  isPublic: boolean,
): TemplateSavePayload => ({
  id: template.id,
  title: template.title,
  description: template.description,
  type: template.type ?? 'checklist',
  sections: template.sections,
  isPublic,
  seoTitle: template.seoTitle,
  seoDescription: template.seoDescription,
  seoUrl: template.seoUrl,
  rules: template.rules,
  categories: template.categories,
  tags: template.tags,
  slug: template.slug,
  version: template.version,
});

const TemplateDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { activeTeamId, getPermissions, isTeamWorkspace } = useWorkspace();
  const {
    createRun,
    createTemplate,
    deleteTemplate,
    getTemplate,
    updateTemplate,
  } = useTemplateLists();
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isCloningTemplate, setIsCloningTemplate] = useState(false);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [visibilityOverride, setVisibilityOverride] = useState<boolean | null>(
    null,
  );
  const {
    billingState,
    loading,
    notFound,
    saveTemplate,
    shareTemplate,
    startRun,
    template,
    history,
  } = useTemplateDetailModel({
    createRun,
    createTemplate,
    getCachedTemplate: getTemplate,
    identifier: id,
    isAuthenticated,
    mode: 'private',
    teamId: activeTeamId,
    userId: user?.id,
    username: user?.username,
  });
  const displayTemplate = template;
  const metrics = (displayTemplate as (ChecklistTemplate & TemplateMetrics) | null) ?? null;
  const isActiveTeamTemplate =
    Boolean(activeTeamId) && displayTemplate?.teamId === activeTeamId;
  // Offer only what the API allows for the user's role (see organizationPermissions.ts).
  const { canCopy: canCopyTemplate, canEdit: canEditTemplate, canStartRun, isOwner } =
    getTemplateActionPermissions({
      activeTeamId,
      isRepoTemplate: Boolean(displayTemplate && isRepoTemplate(displayTemplate)),
      permissionsFor: getPermissions,
      template: displayTemplate ?? { isPublic: false, userId: '' },
      userId: user?.id,
    });
  const canViewTemplateHistory = isOwner || isActiveTeamTemplate;
  const isPublic = visibilityOverride ?? displayTemplate?.isPublic ?? false;
  const totalTasks = displayTemplate?.sections.reduce(
    (count, section) => count + section.items.length,
    0,
  ) ?? 0;
  const createdDate = formatDate(displayTemplate?.createdAt);
  const updatedDate = formatDate(displayTemplate?.updatedAt ?? displayTemplate?.createdAt);
  const historyEntries = (
    history?.data?.versions.length
      ? history.data.versions
      : history?.data?.events ?? []
  ).slice(0, 8);

  useEffect(() => {
    setVisibilityOverride(null);
  }, [displayTemplate?.id]);

  const handleUpgradeRequired = async () => {
    if (isTeamWorkspace) {
      toast.error('This Organization needs a paid plan before using this feature.');
      return;
    }

    await startBillingCheckout(billingState.billingEnabled);
  };

  const handleStartRun = async (runName: string) => {
    setIsCreatingRun(true);
    try {
      const result = await startRun(runName);

      if (result.kind === 'login_required') {
        navigateToLoginWithReturnPath(navigate, location);
        return;
      }

      if (result.kind === 'upgrade_required') {
        await handleUpgradeRequired();
        return;
      }

      if (result.kind === 'error') {
        toast.error(result.message);
        return;
      }

      if (result.runId) {
        toast.success('Checklist run created');
        setRunDialogOpen(false);
        navigate(buildConsoleRunPath(result.runId));
      }
    } finally {
      setIsCreatingRun(false);
    }
  };

  const handleShare = async () => {
    if (!displayTemplate) {
      return;
    }

    setIsCreatingShare(true);
    try {
      const result = await shareTemplate();

      if (result.kind === 'login_required') {
        navigateToLoginWithReturnPath(navigate, location);
        return;
      }

      if (result.kind === 'upgrade_required') {
        await handleUpgradeRequired();
        return;
      }

      if (result.kind === 'error') {
        toast.error(result.message);
        return;
      }

      if (!result.shareUrl) {
        toast.error('Failed to create a share link for this template.');
        return;
      }

      setShareUrl(result.shareUrl);
      setShareDialogOpen(true);
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCloneTemplate = async () => {
    if (!displayTemplate) {
      return;
    }

    if (canEditTemplate) {
      setIsCloningTemplate(true);
      try {
        const duplicatedTemplate = await createTemplate({
          categories: displayTemplate.categories ?? [],
          description: displayTemplate.description,
          isPublic: displayTemplate.isPublic,
          rules: displayTemplate.rules,
          sections: displayTemplate.sections,
          seoDescription: displayTemplate.seoDescription,
          seoTitle: displayTemplate.seoTitle,
          seoUrl: '',
          tags: displayTemplate.tags ?? [],
          title: `${displayTemplate.title} Copy`,
          type: displayTemplate.type ?? 'checklist',
        });

        navigate(buildConsoleTemplatePath(duplicatedTemplate.id));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to duplicate template',
        );
      } finally {
        setIsCloningTemplate(false);
      }

      return;
    }

    setIsCloningTemplate(true);
    try {
      const result = await saveTemplate();

      if (result.kind === 'login_required') {
        navigateToLoginWithReturnPath(navigate, location);
        return;
      }

      if (result.kind === 'upgrade_required') {
        await handleUpgradeRequired();
        return;
      }

      if (result.kind === 'error') {
        toast.error(result.message);
        return;
      }

      toast.success('Template copied to your account');
      if (result.templateId) {
        navigate(buildConsoleTemplatePath(result.templateId));
        return;
      }

      navigate(buildConsoleTemplatesPath());
    } finally {
      setIsCloningTemplate(false);
    }
  };

  const handleExport = () => {
    if (!displayTemplate) {
      return;
    }

    const blob = new Blob([JSON.stringify(displayTemplate, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${displayTemplate.slug ?? displayTemplate.id}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
    toast.success('Template exported as JSON');
  };

  const handleTogglePublic = async (nextIsPublic: boolean) => {
    if (!displayTemplate || !canEditTemplate) {
      return;
    }

    setIsUpdatingVisibility(true);
    try {
      await updateTemplate(buildTemplateSavePayload(displayTemplate, nextIsPublic));
      setVisibilityOverride(nextIsPublic);
      toast.success(
        nextIsPublic ? 'Template is now public' : 'Template is now private',
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update template visibility',
      );
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  const handleDelete = async () => {
    if (!displayTemplate) return;

    setIsDeleting(true);
    try {
      await deleteTemplate(displayTemplate.id);
      toast.success('Template deleted');
      navigate(buildConsoleTemplatesPath());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to archive template';
      toast.error(message);
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <DashboardContentShell>
        <DashboardScrollArea className="flex items-center justify-center">
          <LoadingSpinner message="Loading template..." />
        </DashboardScrollArea>
      </DashboardContentShell>
    );
  }

  if (notFound || !displayTemplate) {
    return (
      <DashboardContentShell>
        <DashboardPageHeader
          title="Template Not Found"
          description="This template does not exist or you do not have access to it."
          actions={
            <Button asChild>
              <Link to={buildConsoleTemplatesPath()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Templates
              </Link>
            </Button>
          }
        />
        <DashboardScrollArea className="flex items-center justify-center">
          <Card className="p-8 text-center">
          <h2 className="mb-4 text-3xl font-bold">Template Not Found</h2>
          <p className="mb-6 text-muted-foreground">
            This template does not exist or you don&apos;t have access to it.
          </p>
        </Card>
        </DashboardScrollArea>
      </DashboardContentShell>
    );
  }

  const templateHeaderActions = (
    <>
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
        <Link to={buildConsoleTemplatesPath()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Link>
      </Button>

      {isPublic ? (
        <Badge
          variant="secondary"
          className="bg-success/20 text-success hover:bg-success/20"
        >
          <Globe className="mr-1 h-3 w-3" />
          Public
        </Badge>
      ) : (
        <Badge variant="secondary">
          <Lock className="mr-1 h-3 w-3" />
          Private
        </Badge>
      )}

      {canEditTemplate ? (
        <>
          {isOwner ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              disabled={isCreatingShare}
              className="border-border"
            >
              <Share2 className="mr-2 h-4 w-4" />
              {isCreatingShare ? 'Creating...' : 'Share'}
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="border-border">
            <Link to={buildConsoleTemplateEditPath(id ?? displayTemplate.id)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
        </>
      ) : user ? (
        canCopyTemplate ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCloneTemplate}
            disabled={isCloningTemplate || billingState.isLoading}
            className="border-border"
          >
            <Copy className="mr-2 h-4 w-4" />
            {isCloningTemplate
              ? 'Copying...'
              : billingState.isLoading
                ? 'Checking plan...'
                : !billingState.isPro
                  ? 'Upgrade to copy template'
                  : 'Copy to My Templates'}
          </Button>
        ) : null
      ) : (
        <Button asChild variant="outline" size="sm" className="border-border">
          <Link to="/login" state={{ from: location }}>
            Log in to copy template
          </Link>
        </Button>
      )}

      {canStartRun || !user ? (
        <Button
          size="sm"
          onClick={() => setRunDialogOpen(true)}
          className="bg-foreground text-background hover:bg-foreground/90"
        >
          <PlayCircle className="mr-2 h-4 w-4" />
          Start Run
        </Button>
      ) : null}

      {canEditTemplate ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={handleCloneTemplate}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setArchiveDialogOpen(true)}
            >
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );

  return (
    <DashboardContentShell>
      <DashboardPageHeader
        title={displayTemplate.title}
        description={
          (displayTemplate.description
            ? normalizeDisplayText(displayTemplate.description)
            : null) ||
          'Review template structure, metadata, and run actions.'
        }
        actions={templateHeaderActions}
      />
      <DashboardScrollArea>
        <div className="mx-auto max-w-6xl space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <ListChecks className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {totalTasks}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Tasks</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Eye className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {metrics?.viewCount?.toLocaleString() ?? '0'}
                  </p>
                  <p className="text-xs text-muted-foreground">Views</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Copy className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {metrics?.copyCount?.toLocaleString() ?? '0'}
                  </p>
                  <p className="text-xs text-muted-foreground">Copies</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <BarChart3 className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {metrics?.runCount?.toLocaleString() ?? '0'}
                  </p>
                  <p className="text-xs text-muted-foreground">Runs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border px-6 py-4">
            <CardTitle className="text-base">Template Structure</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {displayTemplate.sections.map((section, sectionIndex) => (
              <div
                key={section.id}
                className={
                  sectionIndex < displayTemplate.sections.length - 1
                    ? 'border-b border-border'
                    : ''
                }
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
                    {sectionIndex + 1}
                  </div>
                  <span className="font-medium text-foreground">
                    {section.title}
                  </span>
                  <Badge variant="secondary" className="ml-auto">
                    {section.items.length} tasks
                  </Badge>
                </div>
                <div className="space-y-1 pb-3 pl-14 pr-4">
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-transparent py-2"
                    >
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ChevronRight className="h-3 w-3" />
                        <span>{item.title}</span>
                      </div>
                      {item.description ? (
                        <p className="mt-1 whitespace-pre-line pl-5 text-sm text-muted-foreground">
                          {normalizeDisplayText(item.description)}
                        </p>
                      ) : null}
                      {item.contents?.length ? (
                        <div className="mt-3 rounded-lg border border-border bg-background p-3">
                          <ContentRenderer contents={item.contents} disabled />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border px-6 py-4">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Created
                </div>
                <span className="text-sm text-foreground">{createdDate}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Last updated
                </div>
                <span className="text-sm text-foreground">{updatedDate}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  Visibility
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="template-visibility"
                    checked={isPublic}
                    disabled={!canEditTemplate || isUpdatingVisibility}
                    onCheckedChange={handleTogglePublic}
                  />
                  <Label
                    htmlFor="template-visibility"
                    className="text-sm text-foreground"
                  >
                    {isPublic ? 'Public' : 'Private'}
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border px-6 py-4">
              <CardTitle className="text-base">Categories &amp; Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Categories
                </p>
                <div className="flex flex-wrap gap-2">
                  {displayTemplate.categories?.length ? (
                    displayTemplate.categories.map((category) => (
                      <Badge key={category} variant="secondary">
                        {category}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No categories assigned
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tags
                </p>
                <div className="flex flex-wrap gap-2">
                  {displayTemplate.tags?.length ? (
                    displayTemplate.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="border-border"
                      >
                        <Tag className="mr-1 h-3 w-3" />
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No tags assigned
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {canViewTemplateHistory ? (
            <Card className="border-border bg-card lg:col-span-2">
              <CardHeader className="border-b border-border px-6 py-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Changelog
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {history?.isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading template history...
                  </p>
                ) : history?.isError ? (
                  <p className="text-sm text-muted-foreground">
                    Template history is unavailable right now.
                  </p>
                ) : historyEntries.length > 0 ? (
                  <div className="divide-y divide-border">
                    {historyEntries.map((entry) => {
                      const version = isHistoryVersion(entry)
                        ? entry.version
                        : undefined;

                      return (
                        <div
                          key={`${isHistoryVersion(entry) ? 'version' : 'event'}-${entry.id}`}
                          className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {formatHistoryAction(entry.action, version)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getHistoryActorName(entry.actor)}
                            </p>
                          </div>
                          <time className="text-xs text-muted-foreground">
                            {formatDateTime(entry.createdAt)}
                          </time>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No template history has been recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
        </div>
      </DashboardScrollArea>

      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive &quot;{displayTemplate.title}&quot;?
              This removes the template and its future visibility from your
              account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Archiving...' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareLinkDialog
        copiedMessage="Public link copied"
        description="Share this template with others. They can view it and copy it into their library."
        onOpenChange={setShareDialogOpen}
        open={shareDialogOpen}
        title="Share Template"
        url={shareUrl}
      />

      <RunNameDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        templateTitle={displayTemplate.title}
        onConfirm={handleStartRun}
        loading={isCreatingRun}
      />
    </DashboardContentShell>
  );
};

export default TemplateDetail;
