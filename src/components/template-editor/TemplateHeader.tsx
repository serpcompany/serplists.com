import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Loader2, ExternalLink } from "lucide-react";

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
  const publicUrl = templateSlug ? `${window.location.origin}/checklists/${templateSlug}` : null;
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {isEditing ? "Edit Template" : "Create Template"}
            </h1>
            <p className="text-muted-foreground">
              {isEditing ? "Update your checklist template" : "Define a new checklist template"}
            </p>
          </div>
          <div className="flex gap-2">
            {publicUrl && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(publicUrl, '_blank')}
                className="hidden sm:flex"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Public
              </Button>
            )}
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={isSaving}>
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
  );
};