import { Button } from "@/components/ui/button";
import { Save, Loader2, ExternalLink, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { buildPublicTemplatePath } from "@/lib/routes";

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
  onSave
}: TemplateHeaderProps) => {
  const { user } = useAuth();
  const publicUrl =
    templateSlug && user?.username
      ? `${window.location.origin}${buildPublicTemplatePath(user.username, templateSlug)}`
      : null;
  return (
    <div className="border-b border-border/80 bg-background/92 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Button
                variant="ghost"
                onClick={onCancel}
                className="h-auto px-0 text-sm font-medium text-foreground hover:bg-transparent hover:text-foreground/80"
              >
                All templates
              </Button>
              <ChevronRight className="h-4 w-4" />
              <span>Input</span>
              <ChevronRight className="h-4 w-4" />
              <span>Versions</span>
            </div>
            <div className="text-xs font-medium uppercase tracking-[0.26em] text-muted-foreground">
              {isEditing ? "Editor workspace" : "Draft workspace"}
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight">
                {isEditing ? "Refine your checklist pack" : "Create a new checklist pack"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Keep the left rail for structure and use this editor like a docs workspace instead of stacked setup cards.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
            {publicUrl && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(publicUrl, '_blank')}
                className="hidden rounded-lg border-border/80 bg-card/80 sm:flex"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Public
              </Button>
            )}
            <Button variant="outline" onClick={onCancel} className="rounded-lg border-border/80 bg-card/80">
              Cancel
            </Button>
            <Button onClick={onSave} disabled={isSaving} className="rounded-lg">
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
        </div>
      </div>
    </div>
  );
};
