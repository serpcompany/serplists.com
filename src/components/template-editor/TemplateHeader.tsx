import { ChevronRight, ExternalLink, Loader2, Save } from 'lucide-react';

import { PageContainer } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { buildPublicTemplatePath } from '@/lib/routes';

interface TemplateHeaderProps {
  isEditing: boolean;
  isSaving: boolean;
  templateSlug?: string;
  onCancel: () => void;
  onSave: () => void;
}

export const TemplateHeader = ({
  isEditing,
  isSaving,
  templateSlug,
  onCancel,
  onSave,
}: TemplateHeaderProps): JSX.Element => {
  const { user } = useAuth();
  const publicUrl =
    templateSlug && user?.username
      ? `${window.location.origin}${buildPublicTemplatePath(user.username, templateSlug)}`
      : null;
  return (
    <div className="border-b border-border/80 bg-background">
      <PageContainer className="py-4" width="shell">
        <div className="docs-panel flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Button
                variant="ghost"
                onClick={onCancel}
                className="h-auto px-0 text-sm font-medium text-foreground hover:bg-transparent hover:text-foreground/80"
              >
                Templates
              </Button>
              <ChevronRight className="h-4 w-4" />
              <span>{isEditing ? 'Editing' : 'Draft'}</span>
            </div>

            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold tracking-tight">
                Template editor
              </h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Keep the workflow dense: define the metadata, shape the steps,
                and save the SOP without extra landing-page chrome.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {publicUrl ? (
              <Button
                className="hidden rounded-lg sm:flex"
                onClick={() => window.open(publicUrl, '_blank')}
                size="sm"
                variant="outline"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View public
              </Button>
            ) : null}
            <Button
              className="rounded-lg"
              onClick={onCancel}
              variant="outline"
            >
              Cancel
            </Button>
            <Button className="rounded-lg" disabled={isSaving} onClick={onSave}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </PageContainer>
    </div>
  );
};
