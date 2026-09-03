import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer, Surface } from '@/components/layout/page-shell';
import { SEOHead } from '@/components/shared/SEOHead';
import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useTemplateDetailModel } from '@/features/template-detail/useTemplateDetailModel';
import { analytics } from '@/lib/analytics';
import {
  navigateToLoginWithReturnPath,
  startBillingCheckout,
} from '@/lib/access-flow';
import { isRepoTemplate } from '@/lib/repoTemplateCatalog';
import {
  buildConsoleRunPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
  buildPublicProfilePath,
  buildPublicTemplatesPath,
  resolvePublicTemplateOwnerSlug,
} from '@/lib/routes';

const PublicTemplate = () => {
  const { username, templateSlug } = useParams<{
    username: string;
    templateSlug: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { createRun, createTemplate, templates } = useTemplates();
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const {
    billingState,
    loading,
    notFound,
    saveTemplate,
    startRun,
    template,
    totalItems,
  } = useTemplateDetailModel({
    cachedTemplates: templates,
    createRun,
    createTemplate,
    identifier: templateSlug,
    isAuthenticated,
    mode: 'public',
    ownerUsername: username,
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

  const handleStartRun = async () => {
    if (!template) return;

    setIsCreatingRun(true);
    try {
      const result = await startRun(
        `${template.title} - ${new Date().toLocaleDateString()}`,
      );

      if (result.kind === 'login_required') {
        navigateToLoginWithReturnPath(navigate, location);
        return;
      }

      if (result.kind === 'upgrade_required') {
        await startBillingCheckout(billingState.billingEnabled);
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
      setIsCreatingRun(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!template) return;

    setIsSaving(true);
    try {
      const result = await saveTemplate();

      if (result.kind === 'login_required') {
        navigateToLoginWithReturnPath(navigate, location);
        return;
      }

      if (result.kind === 'upgrade_required') {
        await startBillingCheckout(billingState.billingEnabled);
        return;
      }

      if (result.kind === 'error') {
        toast.error(result.message);
        return;
      }

      toast.success('Template saved to your account');
      if (isRepoTemplate(template) && result.templateId) {
        navigate(buildConsoleTemplatePath(result.templateId));
        return;
      }

      navigate(buildConsoleTemplatesPath());
    } finally {
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
        template={displayTemplate}
        totalItems={displayTotalItems}
        ownerSlug={ownerSlug}
        ownerPath={ownerPath}
        isAuthenticated={isAuthenticated}
        isBillingLoading={billingState.isLoading}
        isProUser={billingState.isPro}
        isCreatingRun={isCreatingRun}
        isSaving={isSaving}
        onStartRun={handleStartRun}
        onSaveTemplate={handleSaveTemplate}
      />
    </div>
  );
};

export default PublicTemplate;
