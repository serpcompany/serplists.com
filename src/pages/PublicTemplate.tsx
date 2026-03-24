import { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, PlayCircle } from "lucide-react";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useTemplates } from "@/contexts/TemplatesContext";
import { toast } from "sonner";
import { SEOHead } from "@/components/shared/SEOHead";
import { analytics } from "@/lib/analytics";
import { getBillingStatusQueryKey } from "@/lib/billing";
import { PublicTemplateContent } from "@/components/template/PublicTemplateContent";
import { api } from "@/lib/api";
import { handleAccessFailure, navigateToLoginWithReturnPath, startBillingCheckout } from "@/lib/access-flow";
import type { ChecklistTemplate } from "@/types/checklist";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildRepoTemplateCreatePayload,
  findPublicTemplateByIdentifier,
  isRepoTemplate,
} from "@/lib/repoTemplateCatalog";

const PublicTemplate = () => {
  const { slug } = useParams<{ slug: string }>();
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
  const isProUser = billing.data?.plan === "pro";
  const isBillingLoading = isAuthenticated && billing.isLoading;

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);

      const cachedTemplate = findPublicTemplateByIdentifier(templates, slug);

      if (cachedTemplate?.isPublic) {
        setTemplate(cachedTemplate);
        setNotFound(false);
        analytics.trackTemplateView(cachedTemplate.id, cachedTemplate.title);
        setLoading(false);
        return;
      }
      
      try {
        // Check if slug looks like a UUID (ID)
        const isUuid = slug.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        const foundTemplate = isUuid
          ? await api.getTemplateById(slug)
          : await api.getTemplateBySlug(slug);

        // If the API returns DB-shaped fields, normalize to ChecklistTemplate shape.
        const normalized: ChecklistTemplate = {
          id: foundTemplate.id,
          title: foundTemplate.title,
          description: foundTemplate.description || '',
          type: typeof foundTemplate.type === 'string' ? foundTemplate.type : 'checklist',
          seoTitle: typeof foundTemplate.seoTitle === 'string' ? foundTemplate.seoTitle : '',
          seoDescription: typeof foundTemplate.seoDescription === 'string' ? foundTemplate.seoDescription : '',
          rules: Array.isArray(foundTemplate.rules) ? foundTemplate.rules : undefined,
          sections: foundTemplate.sections || [],
          categories: foundTemplate.categories || [],
          tags: foundTemplate.tags || [],
          userId: foundTemplate.user_id,
          createdAt: foundTemplate.created_at,
          updatedAt: foundTemplate.updated_at || foundTemplate.created_at,
          isPublic: Boolean(foundTemplate.is_public),
          slug: foundTemplate.slug || slug,
          version: foundTemplate.version || 1,
        };

        if (!normalized.isPublic) {
          setNotFound(true);
        } else {
          setTemplate(normalized);
          analytics.trackTemplateView(normalized.id, normalized.title);
        }
      } catch (error) {
        setNotFound(true);
      }
      
      setLoading(false);
    };

    fetchTemplate();
  }, [slug, templates]);

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
        runName: `${template.title} - ${new Date().toLocaleDateString()}`
      });
      
      if (newRun) {
        toast.success("Template run started!");
        navigate(`/run/${newRun.id}`);
      }
    } catch (error) {
      console.error('Error creating run:', error);
      await handleAccessFailure(error, {
        billingEnabled,
        fallbackMessage: "Failed to start template run",
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
        const createdTemplate = await createTemplate(buildRepoTemplateCreatePayload(template));
        navigate(`/templates/${createdTemplate.slug || createdTemplate.id}`);
        return;
      }

      await api.clonePublicTemplate(template.id, { visibility: "private" });
      toast.success("Template saved to your account");
      await queryClient.invalidateQueries({ queryKey: ["templates", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["user-templates", user?.id] });
      navigate("/templates");
    } catch (err) {
      await handleAccessFailure(err, {
        billingEnabled,
        fallbackMessage: "Failed to save template",
        navigate,
        location,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading template...</p>
        </div>
      </div>
    );
  }

  if (notFound || !template) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Template Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The template you're looking for doesn't exist or isn't publicly available.
          </p>
          <Button asChild>
            <Link to="/checklists">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Browse Checklists
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={template?.title}
        description={template?.description || `${template?.title} - Interactive checklist template`}
        keywords={template?.categories || ['checklist', 'template']}
        type="article"
        publishedTime={template?.createdAt}
      />
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Button variant="ghost" asChild className="mb-4">
            <Link to="/checklists">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Checklists
            </Link>
          </Button>
          
          <header className="mb-8">
            <div className="flex items-start justify-between mb-4">
              <h1 className="text-4xl font-bold">{template.title}</h1>
            </div>
            
            {template.description && (
              <p className="text-xl text-muted-foreground mb-4">{template.description}</p>
            )}
            
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Created on {new Date(template.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
                
                {template.categories && template.categories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {template.categories.map((category) => (
                      <Link
                        key={category}
                        to={`/checklists/category/${encodeURIComponent(category)}`}
                        className="inline-block"
                      >
                        <Badge variant="outline" className="text-xs hover:bg-secondary cursor-pointer transition-colors">
                          {category}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={handleSaveTemplate}
                  disabled={isSaving || isBillingLoading}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {isSaving
                    ? "Copying..."
                    : !isAuthenticated
                      ? "Log in to copy template"
                      : isBillingLoading
                        ? "Checking plan..."
                        : !isProUser
                          ? "Upgrade to copy template"
                          : "Copy to My Templates"}
                </Button>
                <Button onClick={handleStartRun} disabled={isCreatingRun}>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  {isCreatingRun ? "Starting..." : "Start Checklist"}
                </Button>
              </div>
            </div>
          </header>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Template Content</h2>
          <PublicTemplateContent sections={template.sections || []} />
        </div>
      </div>
    </div>
  );
};

export default PublicTemplate;
