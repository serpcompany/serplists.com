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
  const loginReturnPath = useCurrentPath();
  const beginVisit = usePageVisit();
  const { user, isAuthenticated } = useAuth();
  const {
    activeTeamId, canEditTemplates, getPermissions, isRoleUnavailable, isTeamWorkspace, retryWorkspace, teams,
    workspaceStatus,
  } = useWorkspace();
  const { createRun, createTemplate, deleteTemplate } = useTemplates();
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isCloningTemplate, setIsCloningTemplate] = useState(false);
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
    totalItems,
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
  const { canEdit: canEditTemplate, canViewHistory: canViewTemplateHistory } = permissions;
  const copyButton = getCopyTemplateButton({
    billingState,
    canEditTemplates,
    isCloning: isCloningTemplate,
    isTeamWorkspace,
    isWorkspaceLoading: workspaceStatus === 'loading' || workspaceStatus === 'error',
    template: displayTemplate,
  });
  const otherDestination = displayTemplate ? nameOtherTemplateDestination(displayTemplate, activeTeamId, teams) : undefined;
  const isPublic = displayTemplate?.isPublic ?? false;
  const isChangingVisibility = isCreatingShare || isUpdatingVisibility;
  const { canStartRun } = getTemplateActionPermissions({
    activeTeamId,
    isRepoTemplate: Boolean(displayTemplate && isRepoTemplate(displayTemplate)),
    permissionsFor: getPermissions,
    template: displayTemplate ?? { isPublic: false, userId: '' },
    userId: user?.id,
  });
  const startRunRoleUnavailable = Boolean(displayTemplate && !displayTemplate.isPublic) &&
    isRoleUnavailable(displayTemplate?.teamId);
  const createdDate = formatLocalDate(displayTemplate?.createdAt);
  const updatedDate = formatLocalDate(displayTemplate?.updatedAt ?? displayTemplate?.createdAt);
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
            editHref={buildConsoleTemplateEditPath(displayTemplate.id)}
            exportDisabled={billingState.isLoading}
            exportLabel={getTemplateExportLabel(billingState)}
            isChangingVisibility={isChangingVisibility}
            isCloning={isCloningTemplate}
            isCreatingShare={isCreatingShare}
            isSignedIn={Boolean(user)}
            loginHref={withReturnPath(buildLoginPath(), loginReturnPath)}
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
            <Stat icon={<ListChecks />} label="Total Tasks" value={totalItems} />
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
