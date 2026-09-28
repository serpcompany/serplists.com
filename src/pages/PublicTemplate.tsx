import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer, Surface } from '@/components/layout/page-shell';
import { SEOHead } from '@/components/shared/SEOHead';
import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useTemplateDetailModel } from '@/features/template-detail/useTemplateDetailModel';
import { analytics } from '@/lib/analytics';
import {
  handleUpgradeRequired,
  navigateToLoginWithReturnPath,
} from '@/lib/access-flow';
import {
  buildConsoleRunPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
  buildPublicProfilePath,
  buildPublicTemplatesPath,
  resolvePublicTemplateOwnerSlug,
} from '@/lib/routes';
import { buildDefaultRunName } from '@/lib/runs/runName';

const PublicTemplate = () => {
  const { username, templateSlug } = useParams<{
    username: string;
    templateSlug: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  // Billing, Save and Start Run all use the active ownership context.
  const { activeTeamId, isTeamWorkspace, isWorkspaceLoading } = useWorkspace();
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

  const handleUpgrade = () =>
    handleUpgradeRequired({
      billingEnabled: billingState.billingEnabled,
      isTeamWorkspace,
    });

  const handleStartRun = async () => {
    // Until the stored Organization is restored, a click would land in Personal.
    if (!template || isWorkspaceLoading || startRunInFlight.current) return;

    startRunInFlight.current = true;
    setIsCreatingRun(true);
    try {
      // This page has no name field, so the default must always fit the run title limit.
      const result = await startRun(
        buildDefaultRunName(template.title, new Date().toLocaleDateString()),
      );

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
        toast.success('Template run started!');
        navigate(buildConsoleRunPath(result.runId));
      }
    } finally {
      startRunInFlight.current = false;
      setIsCreatingRun(false);
    }
  };

  // Resolves true only when the template was saved; every other outcome is false.
  const handleSaveTemplate = async (): Promise<boolean> => {
    if (!template || isWorkspaceLoading || saveInFlight.current) return false;

    saveInFlight.current = true;
    setIsSaving(true);
    try {
      const result = await saveTemplate();

      if (result.kind === 'login_required') {
        navigateToLoginWithReturnPath(navigate, location);
        return false;
      }

      if (result.kind === 'upgrade_required') {
        await handleUpgrade();
        return false;
      }

      if (result.kind === 'error') {
        toast.error(result.message);
        return false;
      }

      toast.success('Template saved to your account');
      // Open the copy itself: it lives in the context it was saved to.
      navigate(
        result.templateId
          ? buildConsoleTemplatePath(result.templateId)
          : buildConsoleTemplatesPath(),
      );
      return true;
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
              <Link to={buildPublicTemplatesPath()}>Browse templates</Link>
            </Button>
          </div>
        </Surface>
      </PageContainer>
    );
  }

  if (notFound || !displayTemplate) {
    return (
      <PageContainer className="py-16" width="narrow">
        <Surface className="text-center" padding="xl" tone="glass">
          <h1 className="text-4xl font-semibold text-foreground">
            Template not found
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            The template you are looking for does not exist or is no longer
            public.
          </p>
          <Button asChild className="mt-6">
            <Link to={buildPublicTemplatesPath()}>
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
      <SEOHead
        title={displayTemplate.seoTitle?.trim() || displayTemplate.title}
        description={
          displayTemplate.seoDescription?.trim() ||
          displayTemplate.description ||
          `${displayTemplate.title} - Interactive checklist template`
        }
        keywords={displayTemplate.categories || ['checklist', 'template']}
        type="article"
        publishedTime={displayTemplate.createdAt}
      />
      <PublicTemplateView
        // A new template gets fresh view state (expanded sections, Saved).
        key={displayTemplate.id}
        template={displayTemplate}
        totalItems={displayTotalItems}
        ownerSlug={ownerSlug}
        ownerPath={ownerPath}
        isAuthenticated={isAuthenticated}
        isBillingLoading={billingState.isLoading}
        isProUser={billingState.isPro}
        isCreatingRun={isCreatingRun}
        isSaving={isSaving}
        isWorkspaceLoading={isWorkspaceLoading}
        onStartRun={handleStartRun}
        onSaveTemplate={handleSaveTemplate}
      />
    </div>
  );
};

export default PublicTemplate;
