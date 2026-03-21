import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Archive, Pencil, PlayCircle, Share2, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useTemplates } from "@/contexts/TemplatesContext";
import { api } from "@/lib/api";
import { handleAccessFailure, navigateToLoginWithReturnPath, startBillingCheckout } from "@/lib/access-flow";
import { RunNameDialog } from "@/components/ui/run-name-dialog";
import { PublicTemplateContent } from "@/components/template/PublicTemplateContent";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ChecklistTemplate } from "@/types/checklist";

const normalizeTemplate = (rawTemplate: Record<string, unknown>): ChecklistTemplate => {
  const categories = Array.isArray(rawTemplate.categories)
    ? (rawTemplate.categories as string[])
    : typeof rawTemplate.category === "string" && rawTemplate.category
      ? [rawTemplate.category]
      : [];

  let sections = [];
  try {
    if (Array.isArray(rawTemplate.sections)) {
      sections = rawTemplate.sections as ChecklistTemplate["sections"];
    } else if (rawTemplate.items) {
      const rawItems = typeof rawTemplate.items === "string"
        ? JSON.parse(rawTemplate.items)
        : rawTemplate.items;
      sections = Array.isArray(rawItems) ? rawItems : [];
    }
  } catch {
    sections = [];
  }

  return {
    id: String(rawTemplate.id || ""),
    title: String(rawTemplate.title || "Template"),
    description: typeof rawTemplate.description === "string" ? rawTemplate.description : "",
    sections,
    userId: String(rawTemplate.user_id || ""),
    createdAt: String(rawTemplate.created_at || ""),
    updatedAt: String(rawTemplate.updated_at || rawTemplate.created_at || ""),
    isPublic: Boolean((rawTemplate as { is_public?: unknown }).is_public),
    slug: typeof rawTemplate.slug === "string" ? rawTemplate.slug : undefined,
    version: typeof rawTemplate.version === "number" ? rawTemplate.version : 1,
    categories,
    tags: Array.isArray(rawTemplate.tags) ? (rawTemplate.tags as string[]) : [],
  };
};

const TemplateDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { getTemplate, createRun, deleteTemplate } = useTemplates();
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isCloningTemplate, setIsCloningTemplate] = useState(false);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const billing = useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => api.getBillingStatus(),
    enabled: !!user,
    retry: false,
  });
  const billingEnabled = billing.data?.billingEnabled ?? true;
  const isProUser = billing.data?.plan === "pro";
  const isOwner = user?.id === template?.userId;

  useEffect(() => {
    const loadTemplate = async () => {
      if (!id) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setNotFound(false);

      const cachedTemplate = getTemplate(id);
      if (cachedTemplate) {
        setTemplate(cachedTemplate);
        setIsLoading(false);
        return;
      }

      try {
        let found = null;
        try {
          const byId = (await api.getTemplateById(id)) as Record<string, unknown>;
          found = byId;
        } catch {
          const bySlug = (await api.getTemplateBySlug(id)) as Record<string, unknown>;
          found = bySlug;
        }

        if (!found) {
          setNotFound(true);
          return;
        }

        setTemplate(normalizeTemplate(found));
      } catch (error) {
        console.error("Failed to load template:", error);
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    void loadTemplate();
  }, [id, getTemplate]);

  const createdDate = template?.createdAt
    ? new Date(template.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : "";

  const handleStartRun = async (runName: string) => {
    if (!template) return;

    setIsCreatingRun(true);
    try {
      const newRun = await createRun({
        templateId: template.id,
        runName,
      });
      if (newRun) {
        toast.success("Checklist run created");
        setRunDialogOpen(false);
        navigate(`/run/${newRun.id}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create checklist run";
      toast.error(message);
    } finally {
      setIsCreatingRun(false);
    }
  };

  const handleShare = async () => {
    if (!template) return;
    if (user?.id !== template.userId) {
      return;
    }

    setIsCreatingShare(true);
    try {
      if (!template.isPublic) {
        await api.updateTemplate(template.id, {
          is_public: true,
        });
      }

      const shareIdentifier = template.slug || template.id;
      const shareUrl = `${window.location.origin}/checklists/${encodeURIComponent(shareIdentifier)}`;

      setTemplate((prev) => prev ? ({
        ...prev,
        isPublic: true
      }) : prev);
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Template share link copied. They can now copy it into their account.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create a share link for this template.";
      toast.error(message || "Failed to create a share link for this template.");
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCloneTemplate = async () => {
    if (!template) return;
    if (!user) {
      navigateToLoginWithReturnPath(navigate, location);
      return;
    }

    if (!isProUser) {
      await startBillingCheckout(billingEnabled);
      return;
    }

    setIsCloningTemplate(true);
    try {
      const clonedTemplate = await api.clonePublicTemplate(template.id, {
        visibility: "private",
      });

      toast.success("Template copied to your account");
      await queryClient.invalidateQueries({ queryKey: ["templates", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["user-templates", user?.id] });
      if (clonedTemplate?.slug || clonedTemplate?.id) {
        navigate(`/templates/${clonedTemplate.slug || clonedTemplate.id}`);
      } else {
        navigate("/templates");
      }
    } catch (err) {
      await handleAccessFailure(err, {
        billingEnabled,
        fallbackMessage: "Failed to copy template",
        navigate,
        location,
      });
    } finally {
      setIsCloningTemplate(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return;

    setIsDeleting(true);
    try {
      await deleteTemplate(template.id);
      toast.success("Template archived");
      navigate("/templates");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to archive template";
      toast.error(message);
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Loading template..." />
      </div>
    );
  }

  if (notFound || !template) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Template Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This template does not exist or you don't have access to it.
          </p>
          <Button asChild>
            <Link to="/templates">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Templates
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Button asChild variant="ghost" className="mb-4">
          <Link to="/templates">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Templates
          </Link>
        </Button>

        <div className="mb-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold">{template.title}</h1>
              {template.description ? (
                <p className="mt-2 text-lg text-muted-foreground">
                  {template.description}
                </p>
              ) : null}
              <p className="mt-3 text-sm text-muted-foreground">
                Created {createdDate}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isOwner ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/templates/${template.id}/edit`)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleShare}
                    disabled={isCreatingShare}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    {isCreatingShare ? "Creating..." : "Share"}
                  </Button>
                </>
              ) : user ? (
                <Button
                  variant="outline"
                  onClick={handleCloneTemplate}
                  disabled={isCloningTemplate}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {isCloningTemplate
                    ? "Copying..."
                    : !isProUser
                      ? "Upgrade to copy template"
                      : "Copy to My Templates"}
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link to="/login" state={{ from: location }}>
                    Log in to copy template
                  </Link>
                </Button>
              )}
              <Button onClick={() => setRunDialogOpen(true)}>
                <PlayCircle className="mr-2 h-4 w-4" />
                Start Run
              </Button>
              {isOwner ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive Template</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to archive "{template.title}"? This removes the template and its future visibility from your account.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                        {isDeleting ? "Archiving..." : "Archive"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          </div>
        </div>

        {template.categories && template.categories.length > 0 ? (
          <div className="mb-8 flex flex-wrap gap-2">
            {template.categories.map((category) => (
              <span
                key={category}
                className="inline-flex rounded-full border px-3 py-1 text-xs text-muted-foreground"
              >
                {category}
              </span>
            ))}
          </div>
        ) : null}

        <PublicTemplateContent sections={template.sections || []} />
      </div>

      <RunNameDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        templateTitle={template.title}
        onConfirm={handleStartRun}
        loading={isCreatingRun}
      />
    </div>
  );
};

export default TemplateDetail;
