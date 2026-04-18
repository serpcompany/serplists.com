import { useEffect } from "react";
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
import { PageContainer } from "@/components/layout/page-shell";
import { buildConsoleTemplatesPath } from "@/lib/routes";
import {
  templateEditorFormSchema,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
import { Form } from "@/components/ui/form";
import type { SaveTemplateResult } from "@/hooks/useTemplateSave";

// eslint-disable-next-line react-refresh/only-export-components
export const shouldNavigateToTemplatesAfterSave = (params: {
  id?: string;
  result: SaveTemplateResult;
}): boolean => params.result.success && !params.id;

const TemplateEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const model = useTemplateEditorModel({ id });
  
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
  useEffect(() => {
    templateForm.reset(model.initialValues);
  }, [model.initialValues, templateForm]);

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
        templateSlug={model.templateSlug}
        title={templateForm.watch("title") || "New Template"}
        onCancel={() => navigate(buildConsoleTemplatesPath())}
        onSave={handleSave}
      />

      {/* Error Alert */}
      {errors.length > 0 && (
        <PageContainer className="py-4" width="shell">
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
        </PageContainer>
      )}

      <Form {...templateForm}>
        <PageContainer className="px-0 py-0 sm:px-0 lg:px-0" width="wide">
          <div className="grid min-h-[calc(100vh-3.5rem)] gap-0 xl:grid-cols-[18rem_minmax(0,1fr)]">
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
        </PageContainer>
      </Form>
    </div>
  );
};

export default TemplateEditor;
