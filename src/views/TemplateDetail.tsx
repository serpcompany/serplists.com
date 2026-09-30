'use client';

import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  FileQuestion,
  FileText,
  Globe,
  Layers,
  List,
  ListChecks,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  DashboardContentShell,
  DashboardEmptyState,
  DashboardLoadingState,
} from '@/components/dashboard/DashboardContentShell';
import { DetailPageLayout } from '@/components/layout/DetailPageLayout';
import { Stat } from '@/components/layout/Stat';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ShareLinkDialog } from '@/components/shared/ShareLinkDialog';
import { TemplateDetailActions } from '@/components/template/TemplateDetailActions';
import {
  TemplateCategoriesCard,
  TemplateDetailsCard,
  TemplateHistoryCard,
} from '@/components/template/TemplateDetailCards';
import { TemplateSectionList } from '@/components/template/TemplateSectionList';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { WorkspaceErrorNotice } from '@/components/workspace/WorkspaceErrorNotice';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { followTemplateActionResult } from '@/features/template-detail/templateActionOutcome';
import { getCopyTemplateButton } from '@/features/template-detail/copyTemplateButton';
import {
  exportTemplateFile,
  getTemplateExportLabel,
} from '@/features/template-detail/templateExport';
import { buildTemplateHistoryTimeline } from '@/features/template-detail/templateHistoryTimeline';
import { useTemplateDetailModel } from '@/features/template-detail/useTemplateDetailModel';
import { usePageVisit } from '@/hooks/usePageVisit';
import {
  handleUpgradeRequiredForContext,
  navigateToLoginWithReturnPath,
} from '@/lib/access-flow';
import { withReturnPath } from '@/lib/auth/returnPath';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { useCurrentPath } from '@/lib/navigation/useCurrentPath';
import {
  buildConsoleRunPath,
  buildConsoleTemplateEditPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
  buildLoginPath,
} from '@/lib/routes';
import { getTemplateActionPermissions } from '@/lib/organizationPermissions';
import { isRepoTemplate } from '@/lib/repoTemplateCatalog';
import { getRunStartedMessage, getTemplateDuplicatedMessage, nameOtherTemplateDestination } from '@/lib/templateDestination';
import { formatLocalDate } from '@/lib/utils/dbTimestamp';

import { Link } from '@/components/navigation/Link';

const TemplateDetail = () => {
  const { id } = useParams<{ id: string }>();
  const router = useAppRouter();
  // Where "Log in to copy template" brings the user back to.
  const currentPath = useCurrentPath();
  // Actions below await a request; they move the user only if they are still here.
  const beginVisit = usePageVisit();
  const { user, isAuthenticated } = useAuth();
  const {
    activeTeamId, canEditTemplates, getPermissions, isRoleUnavailable, isTeamWorkspace, retryWorkspace, teams,
    workspaceStatus,
  } = useWorkspace();
  // No list: the model loads this template by id (docs/design-docs/d1-cost.md).
  const { createRun, createTemplate, deleteTemplate } = useTemplates();
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isCloningTemplate, setIsCloningTemplate] = useState(false);
  // Set synchronously, so a second Duplicate or copy before the re-render cannot create a second copy.
  const cloneInFlight = useRef(false);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const {
    billingState,
    duplicateTemplate,
    loadError,
    loading,
    notFound,
    permissions,
    refetchBilling,
    reload,
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
    workspaceStatus,
  });
  const displayTemplate = template;
  // Organization Templates follow the viewer's role, never who created them.
  const { canEdit: canEditTemplate, canViewHistory: canViewTemplateHistory } = permissions;
  const copyButton = getCopyTemplateButton({
    billingState,
    canEditTemplates,
    isCloning: isCloningTemplate,
    isTeamWorkspace,
    // Personal users are never kept waiting: their status is known at once.
    isWorkspaceLoading: workspaceStatus === 'loading' || workspaceStatus === 'error',
    template: displayTemplate,
  });
  // Runs and copies of another Organization's private template go to that Organization.
  const otherDestination = displayTemplate ? nameOtherTemplateDestination(displayTemplate, activeTeamId, teams) : undefined;
  // The model's template is the only source: Share and the switch both keep it current.
  const isPublic = displayTemplate?.isPublic ?? false;
  // Share and a visibility change must not race on the same template version.
  const isChangingVisibility = isCreatingShare || isUpdatingVisibility;
  // Start Run only where the API accepts it: in the Organization that owns a private
  // Organization Template (where its runs go), otherwise in the active context.
  const { canStartRun } = getTemplateActionPermissions({
    activeTeamId,
    isRepoTemplate: Boolean(displayTemplate && isRepoTemplate(displayTemplate)),
    permissionsFor: getPermissions,
    template: displayTemplate ?? { isPublic: false, userId: '' },
    userId: user?.id,
  });
  // A private Organization Template runs there; with the teams request failed that role is unknown.
  const startRunRoleUnavailable = Boolean(displayTemplate && !displayTemplate.isPublic) &&
    isRoleUnavailable(displayTemplate?.teamId);
  const totalTasks = displayTemplate?.sections.reduce(
    (count, section) => count + section.items.length,
    0,
  ) ?? 0;
  // Parsed as database timestamps (UTC when zoneless); unreadable ones show nothing.
  const createdDate = formatLocalDate(displayTemplate?.createdAt);
  const updatedDate = formatLocalDate(displayTemplate?.updatedAt ?? displayTemplate?.createdAt);
  // Versions and the events no version records (archive, restore, Share), newest first.
  const historyEntries = buildTemplateHistoryTimeline(history?.data);

  const handleUpgrade = () =>
    handleUpgradeRequiredForContext({
      billingEnabled: billingState.billingEnabled,
      isTeamWorkspace,
    });

  const goToLogin = () => navigateToLoginWithReturnPath(router.push);

  const handleStartRun = async (runName: string) => {
    const visit = beginVisit();
    setIsCreatingRun(true);
    try {
      const result = await startRun(runName);
      if (result.kind === 'ok' && result.runId) {
        // The run exists, whether or not the user is still here to open it.
        setRunDialogOpen(false);
      }
      await followTemplateActionResult(result, visit, {
        loginRequired: goToLogin,
        upgradeRequired: handleUpgrade,
        succeeded: ({ runId }) => {
          if (runId) {
            toast.success(getRunStartedMessage(otherDestination));
            router.push(buildConsoleRunPath(runId));
          }
        },
      });
    } finally {
      setIsCreatingRun(false);
    }
  };

  const handleShare = async () => {
    if (!displayTemplate) {
      return;
    }

    const visit = beginVisit();
    setIsCreatingShare(true);
    try {
      await followTemplateActionResult(await shareTemplate(), visit, {
        loginRequired: goToLogin,
        upgradeRequired: handleUpgrade,
        succeeded: (result) => {
          if (!result.shareUrl) {
            toast.error('Failed to create a share link for this template.');
            return;
          }

          setShareUrl(result.shareUrl);
          setShareDialogOpen(true);
        },
      });
    } finally {
      setIsCreatingShare(false);
    }
  };

  // Duplicate (a template the user can edit) and copy (someone else's) both create a
  // template, so both can hit the plan's template limit and must offer the upgrade.
  const handleCloneTemplate = async () => {
    if (!displayTemplate || cloneInFlight.current) {
      return;
    }

    cloneInFlight.current = true;
    const visit = beginVisit();
    setIsCloningTemplate(true);
    try {
      const result = canEditTemplate ? await duplicateTemplate() : await saveTemplate();
      await followTemplateActionResult(result, visit, {
        loginRequired: goToLogin,
        upgradeRequired: handleUpgrade,
        succeeded: ({ templateId }) => {
          toast.success(
            canEditTemplate
              ? getTemplateDuplicatedMessage(otherDestination)
              : isTeamWorkspace
                ? 'Template copied to this Organization'
                : 'Template copied to your account',
          );
          router.push(
            templateId ? buildConsoleTemplatePath(templateId) : buildConsoleTemplatesPath(),
          );
        },
      });
    } finally {
      cloneInFlight.current = false;
      setIsCloningTemplate(false);
    }
  };

  const handleExport = async () => {
    const result = exportTemplateFile({
      billingState,
      template: displayTemplate,
    });
    if (billingState.isError) {
      refetchBilling();
    }

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

    const visit = beginVisit();
    setIsUpdatingVisibility(true);
    try {
      const result = await setVisibility(nextIsPublic);

      if (result.kind === 'login_required') {
        if (visit.isCurrent()) goToLogin();
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

    const visit = beginVisit();
    setIsDeleting(true);
    try {
      await deleteTemplate(displayTemplate.id);
      toast.success('Template deleted');
      if (visit.isCurrent()) {
        router.push(buildConsoleTemplatesPath());
      } else {
        // The user moved on (another template can keep this page mounted).
        setIsDeleting(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete template';
      toast.error(message);
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <DashboardContentShell>
        <DashboardLoadingState label="Loading template..." />
      </DashboardContentShell>
    );
  }

  const backToTemplates = (
    <Link href={buildConsoleTemplatesPath()} className={buttonVariants({ variant: 'outline' })}>
      <ArrowLeft data-icon="inline-start" />
      Back to Templates
    </Link>
  );

  // A failed request is not a missing template: say so and let the user retry.
  if (loadError && !displayTemplate) {
    return (
      <DashboardContentShell>
        <DashboardEmptyState
          icon={<AlertCircle />}
          title="Unable to load template"
          titleAs="h1"
          description={loadError}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={reload}>Try again</Button>
              {backToTemplates}
            </div>
          }
        />
      </DashboardContentShell>
    );
  }

  if (notFound || !displayTemplate) {
    return (
      <DashboardContentShell>
        <DashboardEmptyState
          icon={<FileQuestion />}
          title="Template Not Found"
          titleAs="h1"
          description="This template does not exist or you do not have access to it."
          action={backToTemplates}
        />
      </DashboardContentShell>
    );
  }

  const TypeIcon = displayTemplate.type === 'recipe' ? List : FileText;

  return (
    <>
      <DetailPageLayout
        breadcrumbHome={false}
        breadcrumbs={[
          { href: buildConsoleTemplatesPath(), label: 'My Templates' },
          { label: displayTemplate.title },
        ]}
        notice={
          startRunRoleUnavailable ? (
            <WorkspaceErrorNotice id="template-workspace-error" message="Start Run waits until they load. Check your connection and try again." onRetry={retryWorkspace} />
          ) : undefined
        }
        icon={<TypeIcon />}
        title={displayTemplate.title}
        description={
          displayTemplate.description ||
          'Review template structure, metadata, and run actions.'
        }
        meta={
          <Badge variant="secondary">
            {isPublic ? <Globe data-icon="inline-start" /> : <Lock data-icon="inline-start" />}
            {isPublic ? 'Public' : 'Private'}
          </Badge>
        }
        actions={
          <TemplateDetailActions
            canDuplicate={permissions.canDuplicate}
            canEdit={canEditTemplate}
            canShare={permissions.canShare}
            copyButton={copyButton}
            // The loaded id, never the route param: this page also opens by slug, the editor only by id.
            editHref={buildConsoleTemplateEditPath(displayTemplate.id)}
            exportDisabled={billingState.isLoading}
            exportLabel={getTemplateExportLabel(billingState)}
            isChangingVisibility={isChangingVisibility}
            isCloning={isCloningTemplate}
            isCreatingShare={isCreatingShare}
            isSignedIn={Boolean(user)}
            loginHref={withReturnPath(buildLoginPath(), currentPath)}
            onClone={() => void handleCloneTemplate()}
            onDelete={() => setArchiveDialogOpen(true)}
            onExport={() => void handleExport()}
            onShare={() => void handleShare()}
            onStartRun={() => setRunDialogOpen(true)}
            showStartRun={canStartRun || !user}
          />
        }
        aside={
          <div className="grid grid-cols-2 gap-4">
            <Stat icon={<ListChecks />} label="Total Tasks" value={totalTasks} />
            <Stat icon={<Layers />} label="Sections" value={displayTemplate.sections.length} />
          </div>
        }
      >
        <section aria-labelledby="template-structure" className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight" id="template-structure">
            Template Structure
          </h2>
          <TemplateSectionList collapsible={false} sections={displayTemplate.sections} />
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <TemplateDetailsCard
            createdDate={createdDate}
            isPublic={isPublic}
            onVisibilityChange={(nextIsPublic) => void handleTogglePublic(nextIsPublic)}
            updatedDate={updatedDate}
            visibilityDisabled={!canEditTemplate || isChangingVisibility}
          />
          <TemplateCategoriesCard
            categories={displayTemplate.categories ?? []}
            tags={displayTemplate.tags ?? []}
          />
          {canViewTemplateHistory ? (
            <TemplateHistoryCard
              className="lg:col-span-2"
              entries={historyEntries}
              isError={Boolean(history?.isError)}
              isLoading={Boolean(history?.isLoading)}
            />
          ) : null}
        </div>
      </DetailPageLayout>

      {/* Users see a delete. The API archives the template (making it private), and
          /dashboard/archive can restore it, so the dialog does not say it is permanent. */}
      <ConfirmDialog
        confirmLabel="Delete"
        description={`Are you sure you want to delete "${displayTemplate.title}"?`}
        onConfirm={() => {
          setArchiveDialogOpen(false);
          void handleDelete();
        }}
        onOpenChange={setArchiveDialogOpen}
        open={archiveDialogOpen}
        pending={isDeleting}
        pendingLabel="Deleting..."
        title="Delete template"
      />

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
    </>
  );
};

export default TemplateDetail;
