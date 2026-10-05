'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { GuestRunSaveOffer } from '@/components/run-execution/GuestRunSaveActions';
import { PublicTemplateRecordStates } from '@/components/template/PublicTemplateRecordStates';
import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { startGuestRun } from '@/features/guest-runs/guestRunStore';
import { useGuestRunStatus } from '@/features/guest-runs/useGuestRunStatus';
import { buildCopiedTemplatePath, followTemplateActionResult } from '@/features/template-detail/templateActionOutcome';
import { useTemplateDetailModel } from '@/features/template-detail/useTemplateDetailModel';
import { usePageVisit } from '@/hooks/usePageVisit';
import { analytics } from '@/lib/analytics';
import {
  handleUpgradeRequiredForContext,
  navigateToLoginWithReturnPath,
} from '@/lib/access-flow';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { ownerConsoleContext } from '@/lib/consoleRoutes';
import {
  buildCanonicalPublicTemplateRunPath,
  buildConsoleRunPath,
  buildPublicProfilePath,
  resolvePublicTemplateOwnerSlug,
} from '@/lib/routes';

const PublicTemplate = () => {
  const { username, templateSlug } = useParams<{
    username: string;
    templateSlug: string;
  }>();
  const router = useAppRouter();
  const beginVisit = usePageVisit();
  const { user, isAuthenticated, isLoading: isSessionLoading } = useAuth();
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
  const guestRunStatus = useGuestRunStatus(displayTemplate?.id);
  const guestRunPath =
    displayTemplate && !isAuthenticated && !isSessionLoading
      ? buildCanonicalPublicTemplateRunPath(displayTemplate)
      : null;

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
    if (!isAuthenticated && !guestRunPath) {
      navigateToLoginWithReturnPath(router.push);
      return;
    }
    setRunDialogOpen(true);
  };

  const handleStartRun = async (runName: string) => {
    if (!template || isWorkspaceLoading || !canRunTemplates || startRunInFlight.current) return;

    if (guestRunPath) {
      startGuestRun(template, runName);
      setRunDialogOpen(false);
      toast.success('Checklist run created');
      router.push(guestRunPath);
      return;
    }

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
        succeeded: ({ runId, teamId }) => {
          if (runId) {
            toast.success('Checklist run created');
            router.push(buildConsoleRunPath(runId, ownerConsoleContext(teamId)));
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
        succeeded: (copied) => {
          toast.success(
            isTeamWorkspace
              ? 'Template copied to this Organization'
              : 'Template saved to your account',
          );
          router.push(buildCopiedTemplatePath(copied));
        },
      });
      return result.kind === 'ok';
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
  };

  return (
    <PublicTemplateRecordStates
      loadError={loadError}
      loading={loading}
      notFound={notFound}
      onRetry={reload}
      template={displayTemplate}
    >
      {(shownTemplate) => {
        const ownerSlug = resolvePublicTemplateOwnerSlug(shownTemplate);
        return (
          <div className="pb-12">
            <PublicTemplateView
              key={shownTemplate.id}
              template={shownTemplate}
              totalItems={totalItems}
              ownerSlug={ownerSlug}
              ownerPath={ownerSlug ? buildPublicProfilePath(ownerSlug) : null}
              isAuthenticated={isAuthenticated}
              canSaveTemplate={canEditTemplates}
              canStartRun={canRunTemplates}
              continueRunPath={guestRunStatus === 'in_progress' ? guestRunPath : null}
              guestRunNotice={
                isAuthenticated && canRunTemplates && (guestRunStatus === 'in_progress' || guestRunStatus === 'completed') ? (
                  <GuestRunSaveOffer template={shownTemplate} />
                ) : null
              }
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
              templateTitle={shownTemplate.title}
              onConfirm={handleStartRun}
              loading={isCreatingRun}
            />
          </div>
        );
      }}
    </PublicTemplateRecordStates>
  );
};

export default PublicTemplate;
