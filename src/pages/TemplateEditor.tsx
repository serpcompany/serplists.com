import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTemplateEditorModel } from "@/features/template-editor/useTemplateEditorModel";
import { useTemplateEditorState } from "@/hooks/useTemplateEditorState";
import { TemplateHeader } from "@/components/template-editor/TemplateHeader";
import { OutlineSidebar } from "@/components/template-editor/OutlineSidebar";
import { EditorPanels } from "@/components/template-editor/EditorPanels";
import { GenerateFromClipy } from "@/components/template-editor/GenerateFromClipy";
import { buildConsoleTemplatesPath } from "@/lib/routes";
import {
  templateEditorFormSchema,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
import { Form } from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PublicTemplateContent } from "@/components/template/PublicTemplateContent";
import { MarkdownText } from "@/components/shared/MarkdownText";
import type { SaveTemplateResult } from "@/hooks/useTemplateSave";
import {
  applyTemplateBeforeUnloadWarning,
  confirmTemplateEditorNavigation,
  shouldBlockTemplateEditorNavigation,
} from "@/features/template-editor/navigationGuards";

// eslint-disable-next-line react-refresh/only-export-components
export const shouldNavigateToTemplatesAfterSave = (params: {
  id?: string;
  result: SaveTemplateResult;
}): boolean => params.result.success && !params.id;

const TemplateEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const model = useTemplateEditorModel({ id });
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  const {
    selectedSectionIndex,
    selectedItemIndex,
    showingSEO,
    showingTemplateInfo,
    errors,
    setErrors,
    handleSelectSection,
    handleSelectItem,
    handleSelectSEO,
    handleSelectTemplateInfo
  } = useTemplateEditorState();
  const templateForm = useForm<TemplateEditorFormValues>({
    resolver: zodResolver(templateEditorFormSchema),
    defaultValues: model.initialValues,
  });
  const shouldBlockNavigation = shouldBlockTemplateEditorNavigation({
    isDirty: templateForm.formState.isDirty,
    isSaving: model.isSaving,
    loading: model.loading,
  });

  useEffect(() => {
    templateForm.reset(model.initialValues);
  }, [model.initialValues, templateForm]);

  useEffect(() => {
    if (!shouldBlockNavigation) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      applyTemplateBeforeUnloadWarning(event, shouldBlockNavigation);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldBlockNavigation]);

  const navigateWithEditorGuard = useCallback(
    (path: string) => {
      if (!confirmTemplateEditorNavigation(shouldBlockNavigation)) {
        return;
      }

      navigate(path);
    },
    [navigate, shouldBlockNavigation],
  );

  const handleSave = async () => {
    const isValid = await templateForm.trigger();
    if (!isValid) {
      return;
    }

    const result = await model.save(templateForm.getValues());
    if (shouldNavigateToTemplatesAfterSave({ id, result })) {
      navigate(buildConsoleTemplatesPath());
    }
    setErrors(result.errors);
  };

  if (model.loading) {
    return (
      <div className="flex h-52 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (model.loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to load template</AlertTitle>
        <AlertDescription>{model.loadError}</AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate(buildConsoleTemplatesPath())}>
            Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TemplateHeader
        isEditing={!!id}
        isSaving={model.isSaving}
        onCancel={() => navigateWithEditorGuard(buildConsoleTemplatesPath())}
        onPreview={() => setIsPreviewOpen(true)}
        onSave={handleSave}
        templateSlug={model.templateSlug}
        title={templateForm.watch("title") || "New Template"}
      />

      {/* Error Alert */}
      {errors.length > 0 && (
        <div className="px-4 py-4">
          <Alert variant="destructive" className="border-destructive/40 bg-card shadow-none">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              <ul className="list-inside list-disc">
                {errors.map((error, index: number) => (
                  <li key={index}>{error.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {!id ? (
        <GenerateFromClipy
          onGenerated={(draft) => {
            templateForm.reset(draft, { keepDefaultValues: true });
            handleSelectTemplateInfo();
          }}
        />
      ) : null}

      <Form {...templateForm}>
        <div className="flex min-h-[calc(100vh-3.5rem)]">
          <OutlineSidebar
            selectedItemIndex={selectedItemIndex}
            selectedSectionIndex={selectedSectionIndex}
            showingSEO={showingSEO}
            showingTemplateInfo={showingTemplateInfo}
            onSelectItem={handleSelectItem}
            onSelectSEO={handleSelectSEO}
            onSelectSection={handleSelectSection}
            onSelectTemplateInfo={handleSelectTemplateInfo}
          />

          <EditorPanels
            selectedItemIndex={selectedItemIndex}
            selectedSectionIndex={selectedSectionIndex}
            showingSEO={showingSEO}
            showingTemplateInfo={showingTemplateInfo}
          />
        </div>
      </Form>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template preview</DialogTitle>
            <DialogDescription>
              This preview reflects the current draft. Saving is not required.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-card px-6">
            <div className="border-b border-border py-6">
              <h2 className="text-2xl font-semibold text-foreground">
                {templateForm.watch("title") || "Untitled Template"}
              </h2>
              {templateForm.watch("description") ? (
                <MarkdownText className="mt-2 text-sm text-muted-foreground">
                  {templateForm.watch("description")}
                </MarkdownText>
              ) : null}
            </div>
            <PublicTemplateContent
              initialExpandedItems={Object.fromEntries(
                templateForm
                  .watch("sections")
                  .flatMap((section, sectionIndex) =>
                    section.items.map((_, itemIndex) => [
                      `${sectionIndex}-${itemIndex}`,
                      true,
                    ]),
                  ),
              )}
              sections={templateForm.watch("sections")}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplateEditor;
