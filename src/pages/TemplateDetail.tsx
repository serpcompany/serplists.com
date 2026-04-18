import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Copy,
  Pencil,
  PlayCircle,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';

import { PublicTemplateContent } from '@/components/template/PublicTemplateContent';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RunNameDialog } from '@/components/ui/run-name-dialog';
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
} from '@/components/ui/alert-dialog';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useTemplateDetailModel } from '@/features/template-detail/useTemplateDetailModel';
import {
  navigateToLoginWithReturnPath,
  startBillingCheckout,
} from '@/lib/access-flow';
import {
  buildConsoleRunPath,
  buildConsoleTemplateEditPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
} from '@/lib/routes';

const TemplateDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { createRun, createTemplate, deleteTemplate, getTemplate } =
    useTemplates();
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isCloningTemplate, setIsCloningTemplate] = useState(false);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const {
    billingState,
    loading,
    notFound,
    saveTemplate,
    shareTemplate,
    startRun,
    template,
  } = useTemplateDetailModel({
    createRun,
    createTemplate,
    getCachedTemplate: getTemplate,
    identifier: id,
    isAuthenticated,
    mode: 'private',
    userId: user?.id,
    username: user?.username,
  });
  const isOwner = user?.id === template?.userId;

  const createdDate = template?.createdAt
    ? new Date(template.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const handleStartRun = async (runName: string) => {
    setIsCreatingRun(true);
    try {
      const result = await startRun(runName);

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
        toast.success('Checklist run created');
        setRunDialogOpen(false);
        navigate(buildConsoleRunPath(result.runId));
      }
    } finally {
      setIsCreatingRun(false);
    }
  };

  const handleShare = async () => {
    setIsCreatingShare(true);
    try {
      const result = await shareTemplate();

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

      if (!result.shareUrl) {
        toast.error('Failed to create a share link for this template.');
        return;
      }

      await navigator.clipboard.writeText(result.shareUrl);
      toast.success(
        'Template share link copied. They can now copy it into their account.',
      );
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCloneTemplate = async () => {
    setIsCloningTemplate(true);
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

      toast.success('Template copied to your account');
      if (result.templateId) {
        navigate(buildConsoleTemplatePath(result.templateId));
        return;
      }

      navigate(buildConsoleTemplatesPath());
    } finally {
      setIsCloningTemplate(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return;

    setIsDeleting(true);
    try {
      await deleteTemplate(template.id);
      toast.success('Template archived');
      navigate(buildConsoleTemplatesPath());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to archive template';
      toast.error(message);
      setIsDeleting(false);
    }
  };

  if (loading) {
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
            <Link to={buildConsoleTemplatesPath()}>
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
          <Link to={buildConsoleTemplatesPath()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Templates
          </Link>
        </Button>

        <div className="mb-8 border-b border-border/70 pb-8">
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
                    onClick={() =>
                      navigate(buildConsoleTemplateEditPath(template.id))
                    }
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
                    {isCreatingShare ? 'Creating...' : 'Share'}
                  </Button>
                </>
              ) : user ? (
                <Button
                  variant="outline"
                  onClick={handleCloneTemplate}
                  disabled={isCloningTemplate || billingState.isLoading}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {isCloningTemplate
                    ? 'Copying...'
                    : billingState.isLoading
                      ? 'Checking plan...'
                      : !billingState.isPro
                        ? 'Upgrade to copy template'
                        : 'Copy to My Templates'}
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
                        Are you sure you want to archive "{template.title}"?
                        This removes the template and its future visibility from
                        your account.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting}
                      >
                        {isDeleting ? 'Archiving...' : 'Archive'}
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
