import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import { PageContainer, Surface } from '@/components/layout/page-shell';
import { SEOHead } from '@/components/shared/SEOHead';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { analytics } from '@/lib/analytics';
import { api } from '@/lib/api';
import {
  handleAccessFailure,
  navigateToLoginWithReturnPath,
  startBillingCheckout,
} from '@/lib/access-flow';
import { getBillingStatusQueryKey } from '@/lib/billing';
import {
  buildRepoTemplateCreatePayload,
  findPublicTemplateByIdentifier,
  isRepoTemplate,
} from '@/lib/repoTemplateCatalog';
import {
  buildConsoleRunPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
  buildPublicProfilePath,
  buildPublicTemplatesPath,
  resolvePublicTemplateOwnerSlug,
} from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

const countTemplateItems = (template: ChecklistTemplate) =>
  template.sections.reduce((total, section) => total + section.items.length, 0);

const PublicTemplate = () => {
  const { username, templateSlug } = useParams<{
    username: string;
    templateSlug: string;
  }>();
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { createRun, createTemplate, templates } = useTemplates();
  const queryClient = useQueryClient();
  const billing = useQuery({
    queryKey: getBillingStatusQueryKey(user?.id),
    queryFn: () => api.getBillingStatus(),
    enabled: isAuthenticated,
    retry: false,
  });
  const billingEnabled = billing.data?.billingEnabled ?? true;
  const isProUser = billing.data?.plan === 'pro';
  const isBillingLoading = isAuthenticated && billing.isLoading;

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!username || !templateSlug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);

      const cachedTemplate = findPublicTemplateByIdentifier(
        templates,
        templateSlug,
      );

      if (cachedTemplate?.isPublic) {
        const cachedOwnerSlug = resolvePublicTemplateOwnerSlug(cachedTemplate);

        if (cachedOwnerSlug?.toLowerCase() === username.toLowerCase()) {
          setTemplate(cachedTemplate);
          setNotFound(false);
          analytics.trackTemplateView(cachedTemplate.id, cachedTemplate.title);
          setLoading(false);
          return;
        }
      }

      try {
        const isUuid = templateSlug.match(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
        const foundTemplate = isUuid
          ? await api.getTemplateById(templateSlug)
          : await api.getTemplateBySlug(templateSlug);

        const normalized: ChecklistTemplate = {
          id: foundTemplate.id,
          title: foundTemplate.title,
          description: foundTemplate.description || '',
          type:
            typeof foundTemplate.type === 'string'
              ? foundTemplate.type
              : 'checklist',
          seoTitle:
            typeof foundTemplate.seoTitle === 'string'
              ? foundTemplate.seoTitle
              : '',
          seoDescription:
            typeof foundTemplate.seoDescription === 'string'
              ? foundTemplate.seoDescription
              : '',
          rules: Array.isArray(foundTemplate.rules)
            ? foundTemplate.rules
            : undefined,
          sections: foundTemplate.sections || [],
          categories: foundTemplate.categories || [],
          tags: foundTemplate.tags || [],
          userId: foundTemplate.user_id,
          createdAt: foundTemplate.created_at,
          updatedAt: foundTemplate.updated_at || foundTemplate.created_at,
          isPublic: Boolean(foundTemplate.is_public),
          slug: foundTemplate.slug || templateSlug,
          version: foundTemplate.version || 1,
          ownerProfile:
            typeof foundTemplate.owner_username === 'string' ||
            typeof foundTemplate.owner_full_name === 'string'
              ? {
                  username:
                    typeof foundTemplate.owner_username === 'string'
                      ? foundTemplate.owner_username
                      : undefined,
                  full_name:
                    typeof foundTemplate.owner_full_name === 'string'
                      ? foundTemplate.owner_full_name
                      : undefined,
                }
              : undefined,
        };

        let ownerSlug = resolvePublicTemplateOwnerSlug(normalized);

        if (!ownerSlug && normalized.userId) {
          try {
            const profile = await api.getProfileById(normalized.userId);
            ownerSlug =
              typeof profile.username === 'string' ? profile.username : null;
            normalized.ownerProfile = {
              username: ownerSlug ?? undefined,
              full_name:
                typeof profile.full_name === 'string'
                  ? profile.full_name
                  : undefined,
            };
          } catch {
            ownerSlug = null;
          }
        }

        if (
          !normalized.isPublic ||
          ownerSlug?.toLowerCase() !== username.toLowerCase()
        ) {
          setNotFound(true);
        } else {
          setTemplate(normalized);
          analytics.trackTemplateView(normalized.id, normalized.title);
        }
      } catch {
        setNotFound(true);
      }

      setLoading(false);
    };

    void fetchTemplate();
  }, [templateSlug, templates, username]);

  const handleStartRun = async () => {
    if (!template) return;

    if (!isAuthenticated) {
      navigateToLoginWithReturnPath(navigate, location);
      return;
    }

    setIsCreatingRun(true);
    try {
      const newRun = await createRun({
        templateId: template.id,
        runName: `${template.title} - ${new Date().toLocaleDateString()}`,
      });

      if (newRun) {
        toast.success('Template run started!');
        navigate(buildConsoleRunPath(newRun.id));
      }
    } catch (error) {
      console.error('Error creating run:', error);
      await handleAccessFailure(error, {
        billingEnabled,
        fallbackMessage: 'Failed to start template run',
        navigate,
        location,
      });
    } finally {
      setIsCreatingRun(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!template) return;
    if (!isAuthenticated) {
      navigateToLoginWithReturnPath(navigate, location);
      return;
    }

    if (isBillingLoading) {
      return;
    }

    if (!isProUser) {
      await startBillingCheckout(billingEnabled);
      return;
    }

    setIsSaving(true);
    try {
      if (isRepoTemplate(template)) {
        const createdTemplate = await createTemplate(
          buildRepoTemplateCreatePayload(template),
        );
        navigate(buildConsoleTemplatePath(createdTemplate.id));
        return;
      }

      await api.clonePublicTemplate(template.id, { visibility: 'private' });
      toast.success('Template saved to your account');
      await queryClient.invalidateQueries({
        queryKey: ['templates', user?.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ['user-templates', user?.id],
      });
      navigate(buildConsoleTemplatesPath());
    } catch (error) {
      await handleAccessFailure(error, {
        billingEnabled,
        fallbackMessage: 'Failed to save template',
        navigate,
        location,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const ownerSlug = template ? resolvePublicTemplateOwnerSlug(template) : null;
  const ownerPath = ownerSlug ? buildPublicProfilePath(ownerSlug) : null;
  const totalItems = useMemo(
    () => (template ? countTemplateItems(template) : 0),
    [template],
  );

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

  if (notFound || !template) {
    return (
      <PageContainer className="py-16" width="narrow">
        <Surface className="text-center" padding="xl" tone="glass">
          <h1 className="text-4xl font-semibold text-foreground">
            Template not found
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            The checklist you are looking for does not exist or is no longer
            public.
          </p>
          <Button asChild className="mt-6">
            <Link to={buildPublicTemplatesPath()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Browse checklists
            </Link>
          </Button>
        </Surface>
      </PageContainer>
    );
  }

  return (
    <div className="pb-24">
      <SEOHead
        title={template.title}
        description={
          template.description ||
          `${template.title} - Interactive checklist template`
        }
        keywords={template.categories || ['checklist', 'template']}
        type="article"
        publishedTime={template.createdAt}
      />
      <PublicTemplateView
        template={template}
        totalItems={totalItems}
        ownerSlug={ownerSlug}
        ownerPath={ownerPath}
        isAuthenticated={isAuthenticated}
        isBillingLoading={isBillingLoading}
        isProUser={isProUser}
        isCreatingRun={isCreatingRun}
        isSaving={isSaving}
        onStartRun={handleStartRun}
        onSaveTemplate={handleSaveTemplate}
      />
    </div>
  );
};

export default PublicTemplate;
