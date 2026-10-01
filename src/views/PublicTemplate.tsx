'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileX } from 'lucide-react';
import { toast } from 'sonner';

import { PageEmptyState, PageLoadingState } from '@/components/layout/PageState';
import { NoIndexMeta } from '@/components/seo/NoIndexMeta';
import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import { Button, buttonVariants } from '@/components/ui/button';
import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { followTemplateActionResult } from '@/features/template-detail/templateActionOutcome';
import { useTemplateDetailModel } from '@/features/template-detail/useTemplateDetailModel';
import { usePageVisit } from '@/hooks/usePageVisit';
import { analytics } from '@/lib/analytics';
import {
  handleUpgradeRequiredForContext,
  navigateToLoginWithReturnPath,
} from '@/lib/access-flow';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { TEMPLATE_NOT_FOUND_PAGE_TEXT } from '@/lib/publicPageMeta';
import {
  buildConsoleRunPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
  buildPublicProfilePath,
  buildPublicTemplatesPath,
  resolvePublicTemplateOwnerSlug,
} from '@/lib/routes';

import { Link } from '@/components/navigation/Link';

const PublicTemplate = () => {
  const { username, templateSlug } = useParams<{
    username: string;
    templateSlug: string;
  }>();
  const router = useAppRouter();
  const beginVisit = usePageVisit();
  const { user, isAuthenticated } = useAuth();
  const {
    activeTeamId,
    canEditTemplates,
    canRunTemplates,
    isTeamWorkspace,
    isWorkspaceLoading,
    retryWorkspace,
    selectWorkspace,
    workspaceStatus,
  } = useWorkspace();
  const { createRun, createTemplate } = useTemplates();
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const startRunInFlight = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlight = useRef(false);
  const {
    billingState,
    loadError,
    loading,
    notFound,
    reload,
    saveTemplate,
    startRun,
    template,
    totalItems,
  } = useTemplateDetailModel({
    createRun,
    createTemplate,
    identifier: templateSlug,
    isAuthenticated,
    mode: 'public',
    ownerUsername: username,
    teamId: activeTeamId,
    userId: user?.id,
    workspaceStatus,
  });
  const displayTemplate = template;

  useEffect(() => {
    if (!displayTemplate) {
      return;
    }

    analytics.trackTemplateView(displayTemplate.id, displayTemplate.title);
  }, [displayTemplate]);

  const handleUpgrade = () =>
    handleUpgradeRequiredForContext({
      billingEnabled: billingState.billingEnabled,
      isTeamWorkspace,
    });

  const followResult = {
    loginRequired: () => navigateToLoginWithReturnPath(router.push),
    upgradeRequired: handleUpgrade,
  };

  const handleStartRunClick = () => {
    if (!template || isWorkspaceLoading || !canRunTemplates) return;
    if (!isAuthenticated) {
      navigateToLoginWithReturnPath(router.push);
      return;
    }
    setRunDialogOpen(true);
  };

  const handleStartRun = async (runName: string) => {
    if (!template || isWorkspaceLoading || !canRunTemplates || startRunInFlight.current) return;

    const visit = beginVisit();
    startRunInFlight.current = true;
    setIsCreatingRun(true);
    try {
      const result = await startRun(runName);
      if (result.kind === 'ok' && result.runId) {
        setRunDialogOpen(false);
      }
      await followTemplateActionResult(result, visit, {
        ...followResult,
        succeeded: ({ runId }) => {
          if (runId) {
            toast.success('Checklist run created');
            router.push(buildConsoleRunPath(runId));
          }
        },
      });
    } finally {
      startRunInFlight.current = false;
      setIsCreatingRun(false);
    }
  };

  const handleSaveTemplate = async (): Promise<boolean> => {
    if (!template || isWorkspaceLoading || !canEditTemplates || saveInFlight.current) {
      return false;
    }

    const visit = beginVisit();
    saveInFlight.current = true;
    setIsSaving(true);
    try {
      const result = await saveTemplate();
      await followTemplateActionResult(result, visit, {
        ...followResult,
        succeeded: ({ templateId }) => {
          toast.success(
            isTeamWorkspace
              ? 'Template copied to this Organization'
              : 'Template saved to your account',
          );
          router.push(
            templateId ? buildConsoleTemplatePath(templateId) : buildConsoleTemplatesPath(),
          );
        },
      });
      return result.kind === 'ok';
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
  };

  const ownerSlug = displayTemplate
    ? resolvePublicTemplateOwnerSlug(displayTemplate)
    : null;
  const ownerPath = ownerSlug ? buildPublicProfilePath(ownerSlug) : null;

  if (loading) {
    return <PageLoadingState label="Loading template…" />;
  }

  if (loadError && !displayTemplate) {
    return (
      <PageEmptyState
        actions={
          <>
            <Button onClick={reload}>Try again</Button>
            <Link href={buildPublicTemplatesPath()} className={buttonVariants({ variant: 'outline' })}>
              Browse the Template Library
            </Link>
          </>
        }
        description={loadError}
        title="Unable to load template"
      />
    );
  }

  if (notFound || !displayTemplate) {
    return (
      <>
        <NoIndexMeta follow={false} />
        <PageEmptyState
          actions={
            <Link href={buildPublicTemplatesPath()} className={buttonVariants()}>
              <ArrowLeft data-icon="inline-start" />
              Browse the Template Library
            </Link>
          }
          description={TEMPLATE_NOT_FOUND_PAGE_TEXT.description}
          icon={<FileX />}
          title={TEMPLATE_NOT_FOUND_PAGE_TEXT.title}
        />
      </>
    );
  }

  return (
    <div className="pb-12">
      <PublicTemplateView
        key={displayTemplate.id}
        template={displayTemplate}
        totalItems={totalItems}
        ownerSlug={ownerSlug}
        ownerPath={ownerPath}
        isAuthenticated={isAuthenticated}
        canSaveTemplate={canEditTemplates}
        canStartRun={canRunTemplates}
        isBillingError={billingState.isError}
        isBillingLoading={billingState.isLoading}
        isProUser={billingState.isPro}
        isCreatingRun={isCreatingRun}
        isSaving={isSaving}
        isTeamWorkspace={isTeamWorkspace}
        isWorkspaceLoading={isWorkspaceLoading}
        workspaceError={
          isAuthenticated && workspaceStatus === 'error'
            ? {
                onContinueInPersonal: () => selectWorkspace('personal'),
                onRetry: retryWorkspace,
              }
            : null
        }
        onStartRun={handleStartRunClick}
        onSaveTemplate={handleSaveTemplate}
      />
      <RunNameDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        templateTitle={displayTemplate.title}
        onConfirm={handleStartRun}
        loading={isCreatingRun}
      />
    </div>
  );
};

export default PublicTemplate;
