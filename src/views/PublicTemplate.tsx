'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer, Surface } from '@/components/layout/page-shell';
import { NoIndexMeta } from '@/components/seo/NoIndexMeta';
import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import { Button } from '@/components/ui/button';
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
import { buildDefaultRunName } from '@/lib/runs/runName';

import { Link } from '@/components/navigation/Link';

// The page's title, description, canonical URL and robots come from the server
// (src/server/pageMeta/templatePage.ts), which finds the template the same way.
const PublicTemplate = () => {
  const { username, templateSlug } = useParams<{
    username: string;
    templateSlug: string;
  }>();
  const router = useAppRouter();
  // Start Run and Save await a request; they move the user only if they are still here.
  const beginVisit = usePageVisit();
  const { user, isAuthenticated } = useAuth();
  // Billing, Save and Start Run all use the active ownership context. In an
  // Organization, Save needs a role that adds Templates and Start Run one that starts
  // runs (the API refuses the rest); both are always true in Personal.
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
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  // Set synchronously, so a second click before the re-render cannot create a second run.
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
  const displayTotalItems =
    template && totalItems > 0
      ? totalItems
      : (displayTemplate?.sections ?? []).reduce(
          (count, section) => count + section.items.length,
          0,
        );

  useEffect(() => {
    if (!displayTemplate) {
      return;
    }

    analytics.trackTemplateView(displayTemplate.id, displayTemplate.title);
  }, [displayTemplate]);

  // Save and Start Run both act in the active context, so an Organization at its limit
  // needs an Organization plan; a Personal checkout cannot lift it.
  const handleUpgrade = () =>
    handleUpgradeRequiredForContext({
      billingEnabled: billingState.billingEnabled,
      isTeamWorkspace,
    });

  const followResult = {
    loginRequired: () => navigateToLoginWithReturnPath(router.push),
    upgradeRequired: handleUpgrade,
  };

  const handleStartRun = async () => {
    // Until the stored Organization is restored, a click would land in Personal.
    if (!template || isWorkspaceLoading || !canRunTemplates || startRunInFlight.current) return;

    const visit = beginVisit();
    startRunInFlight.current = true;
    setIsCreatingRun(true);
    try {
      // This page has no name field: it uses the default name the other Start Run entry
      // points give, which always fits the run title limit.
      const result = await startRun(buildDefaultRunName(template.title));
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

  // Resolves true only when the template was saved; every other outcome is false.
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
          // Open the copy itself: it lives in the context it was saved to.
          router.push(
            templateId ? buildConsoleTemplatePath(templateId) : buildConsoleTemplatesPath(),
          );
        },
      });
      // The copy exists even when the user has already left this page.
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
    return (
      <PageContainer className="py-16" width="shell">
        <Surface className="text-center" padding="xl" tone="glass">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">
            Loading template…
          </p>
        </Surface>
      </PageContainer>
    );
  }

  // A failed request is not a missing template: say so and let the visitor retry.
  // No noindex here: a crawler that hits a brief outage must not drop a live page.
  if (loadError && !displayTemplate) {
    return (
      <PageContainer className="py-16" width="narrow">
        <Surface className="text-center" padding="xl" tone="glass">
          <h1 className="text-4xl font-semibold text-foreground">
            Unable to load template
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {loadError}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={reload}>Try again</Button>
            <Button asChild variant="outline">
              <Link href={buildPublicTemplatesPath()}>Browse templates</Link>
            </Button>
          </div>
        </Surface>
      </PageContainer>
    );
  }

  // The page is served with HTTP 200, so noindex is what keeps a gone template out of search.
  // The server's metadata says so too; this tag covers a template that went away (or private)
  // after the server rendered the page.
  if (notFound || !displayTemplate) {
    return (
      <PageContainer className="py-16" width="narrow">
        <NoIndexMeta follow={false} />
        <Surface className="text-center" padding="xl" tone="glass">
          <h1 className="text-4xl font-semibold text-foreground">
            {TEMPLATE_NOT_FOUND_PAGE_TEXT.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {TEMPLATE_NOT_FOUND_PAGE_TEXT.description}
          </p>
          <Button asChild className="mt-6">
            <Link href={buildPublicTemplatesPath()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Browse templates
            </Link>
          </Button>
        </Surface>
      </PageContainer>
    );
  }

  return (
    <div className="pb-24">
      <PublicTemplateView
        // A new template gets fresh view state (expanded sections, Saved).
        key={displayTemplate.id}
        template={displayTemplate}
        totalItems={displayTotalItems}
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
        // The public shell has no WorkspaceGate, so a failed teams request is shown here.
        workspaceError={
          isAuthenticated && workspaceStatus === 'error'
            ? {
                onContinueInPersonal: () => selectWorkspace('personal'),
                onRetry: retryWorkspace,
              }
            : null
        }
        onStartRun={handleStartRun}
        onSaveTemplate={handleSaveTemplate}
      />
    </div>
  );
};

export default PublicTemplate;
