import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Calendar,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Globe,
  History,
  Layers,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { Switch } from '@/components/ui/switch';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import {
  DashboardContentShell,
  DashboardPageHeader,
  DashboardScrollArea,
} from '@/components/dashboard/DashboardContentShell';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplateLists } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { getCopyTemplateButton } from '@/features/template-detail/copyTemplateButton';
import {
  exportTemplateFile,
  getTemplateExportLabel,
} from '@/features/template-detail/templateExport';
import { useTemplateDetailModel } from '@/features/template-detail/useTemplateDetailModel';
import {
  handleUpgradeRequired,
  navigateToLoginWithReturnPath,
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

const historyActionLabels: Record<string, string> = {
  'template.created': 'Created template',
  'template.updated': 'Updated template',
  'template.imported': 'Imported template',
  'template.cloned': 'Copied template',
  'template.deleted': 'Archived template',
  'template.versioned': 'Saved template version',
};

const formatHistoryAction = (
  action: string,
  version?: number,
): string => {
  const label = historyActionLabels[action] ?? action;
  return typeof version === 'number' ? `${label} v${version}` : label;
};

const getHistoryActorName = (
  actor?: TemplateHistoryEvent['actor'] | TemplateHistoryVersion['actor'],
): string => actor?.name || actor?.username || actor?.email || 'Unknown user';

const isHistoryVersion = (
  entry: TemplateHistoryEvent | TemplateHistoryVersion,
): entry is TemplateHistoryVersion => 'version' in entry;

const TemplateDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { activeTeamId, canEditTemplates, isTeamWorkspace } = useWorkspace();
  const {
    createRun,
    createTemplate,
    deleteTemplate,
    workspaceTemplates,
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
  const {
    billingState,
    loading,
    notFound,
    permissions,
    saveTemplate,
    setVisibility,
    shareTemplate,
    startRun,
    template,
    history,
  } = useTemplateDetailModel({
    canEditTemplates,
    createRun,
    createTemplate,
    identifier: id,
    isAuthenticated,
    mode: 'private',
    teamId: activeTeamId,
    userId: user?.id,
    username: user?.username,
    workspaceTemplates,
  });
  const displayTemplate = template;
  // Organization Templates follow the viewer's role, never who created them.
  const { canEdit: canEditTemplate, canViewHistory: canViewTemplateHistory } = permissions;
  const copyButton = getCopyTemplateButton({
    billingState,
    canEditTemplates,
    isCloning: isCloningTemplate,
    isTeamWorkspace,
  });
  // The model's template is the only source: Share and the switch both keep it current.
  const isPublic = displayTemplate?.isPublic ?? false;
  // Share and a visibility change must not race on the same template version.
  const isChangingVisibility = isCreatingShare || isUpdatingVisibility;
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

  const handleUpgrade = () =>
    handleUpgradeRequired({
      billingEnabled: billingState.billingEnabled,
      isTeamWorkspace,
    });

  const handleStartRun = async (runName: string) => {
    setIsCreatingRun(true);
    try {
      const result = await startRun(runName);

      if (result.kind === 'login_required') {
        navigateToLoginWithReturnPath(navigate, location);
        return;
      }

      if (result.kind === 'upgrade_required') {
        await handleUpgrade();
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
        await handleUpgrade();
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

  const handleCopyShareLink = async () => {
    if (!shareUrl) {
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    toast.success('Public link copied');
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
        await handleUpgrade();
        return;
      }

      if (result.kind === 'error') {
        toast.error(result.message);
        return;
      }

      toast.success(
        isTeamWorkspace
          ? 'Template copied to this Organization'
          : 'Template copied to your account',
      );
      if (result.templateId) {
        navigate(buildConsoleTemplatePath(result.templateId));
        return;
      }

      navigate(buildConsoleTemplatesPath());
    } finally {
      setIsCloningTemplate(false);
    }
  };

  const handleExport = async () => {
    const result = exportTemplateFile({
      billingState,
      template: displayTemplate,
    });

    if (result.kind === 'upgrade_required') {
      await handleUpgrade();
    } else if (result.kind === 'error') {
      toast.error(result.message);
    } else {
      toast.success('Template exported as JSON');
      if (result.assetWarnings > 0) {
        toast.warning('Uploaded files are not included in JSON exports.');
      }
    }
  };

  const handleTogglePublic = async (nextIsPublic: boolean) => {
    if (!displayTemplate || !canEditTemplate || isChangingVisibility) {
      return;
    }

    setIsUpdatingVisibility(true);
    try {
      const result = await setVisibility(nextIsPublic);

      if (result.kind === 'login_required') {
        navigateToLoginWithReturnPath(navigate, location);
      } else if (result.kind === 'ok') {
        toast.success(
          nextIsPublic ? 'Template is now public' : 'Template is now private',
        );
      } else {
        toast.error(
          result.kind === 'error'
            ? result.message
            : 'Failed to update template visibility',
        );
      }
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
          {permissions.canShare ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              disabled={isChangingVisibility}
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
        copyButton.visible ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCloneTemplate}
            disabled={copyButton.disabled}
            className="border-border"
          >
            <Copy className="mr-2 h-4 w-4" />
            {copyButton.label}
          </Button>
        ) : null
      ) : (
        <Button asChild variant="outline" size="sm" className="border-border">
          <Link to="/login" state={{ from: location }}>
            Log in to copy template
          </Link>
        </Button>
      )}

      <Button
        size="sm"
        onClick={() => setRunDialogOpen(true)}
        className="bg-foreground text-background hover:bg-foreground/90"
      >
        <PlayCircle className="mr-2 h-4 w-4" />
        Start Run
      </Button>

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
            {permissions.canDuplicate ? (
              <DropdownMenuItem onClick={handleCloneTemplate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={handleExport} disabled={billingState.isLoading}>
              <Download className="mr-2 h-4 w-4" />
              {getTemplateExportLabel(billingState)}
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
        <div className="grid gap-4 sm:grid-cols-2">
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
                  <Layers className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {displayTemplate.sections.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Sections</p>
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
                    disabled={!canEditTemplate || isChangingVisibility}
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

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle>Share Template</DialogTitle>
            <DialogDescription>
              Share this template with others. They can view it and copy it into
              their library.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="border-border bg-muted"
              />
              <Button
                aria-label="Copy share link"
                variant="outline"
                size="icon"
                onClick={handleCopyShareLink}
                className="shrink-0 border-border"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShareDialogOpen(false)}
              className="border-border"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
