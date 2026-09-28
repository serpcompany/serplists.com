import { useEffect, useState } from "react";
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
import type { SaveTemplateResult } from "@/hooks/useTemplateSave";
import {
  cloneTemplateEditorFormValues,
  rebaseTemplateEditorFormAfterSave,
} from "@/features/template-editor/postSaveFormState";
import {
  EDITOR_LOAD_LATEST_MESSAGE,
  getTemplateEditorLeaveMessage,
  shouldBlockTemplateEditorNavigation,
} from "@/features/template-editor/navigationGuards";
import {
  TemplateEditorUploadsContext,
  usePendingTemplateEditorUploads,
} from "@/features/template-editor/pendingUploads";
import { useTemplateEditorLeaveGuard } from "@/features/template-editor/useTemplateEditorLeaveGuard";
import { useTemplateEditorAccess } from "@/features/template-editor/useTemplateEditorAccess";
import { TemplateEditorAccessNotices } from "@/components/template-editor/TemplateEditorAccessNotices";

// eslint-disable-next-line react-refresh/only-export-components
export const shouldNavigateToTemplatesAfterSave = (params: {
  id?: string;
  result: SaveTemplateResult;
}): boolean => params.result.success && !params.id;

// eslint-disable-next-line react-refresh/only-export-components
export const shouldLockTemplateEditorWhileSaving = (params: {
  id?: string;
  isSaving: boolean;
}): boolean => params.isSaving && !params.id;

const TemplateEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const model = useTemplateEditorModel({ id });
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  // The last save was refused because someone saved the template after it loaded.
  const [editConflict, setEditConflict] = useState(false);
  
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
  // A picked file reaches the form only when its upload finishes.
  const { uploads, pendingCount } = usePendingTemplateEditorUploads();
  const hasPendingUploads = pendingCount > 0;
  const shouldBlockNavigation = shouldBlockTemplateEditorNavigation({
    isDirty: templateForm.formState.isDirty,
    isSaving: model.isSaving,
    loading: model.loading,
    hasPendingUploads,
  });

  useEffect(() => {
    templateForm.reset(model.initialValues);
  }, [model.initialValues, templateForm]);

  const { allowLeave, guardLeave } = useTemplateEditorLeaveGuard(
    shouldBlockNavigation,
    getTemplateEditorLeaveMessage({ hasPendingUploads }),
  );
  // Plan limits and an ended session: the upgrade or sign-in action, and the kept draft.
  const access = useTemplateEditorAccess({
    isCreate: !id,
    getValues: templateForm.getValues,
    allowLeave,
    guardLeave,
  });

  const handleSave = async () => {
    // Save is disabled meanwhile; this also covers a call that skips the button.
    if (uploads.count() > 0) {
      return;
    }

    // model.save validates first and returns errors that name the field; the alert
    // below shows them. The copy is what gets sent; the form stays editable meanwhile.
    const submitted = cloneTemplateEditorFormValues(templateForm.getValues());
    const result = await model.save(submitted);
    // A plan gate or an ended session shows as a notice with its action, not as an error.
    setErrors(access.handleSaveResult(result) ? [] : result.errors);
    setEditConflict(Boolean(result.editConflict));
    if (!result.success || !result.savedValues) {
      return;
    }

    if (shouldNavigateToTemplatesAfterSave({ id, result })) {
      // The create is saved (and the editor was locked meanwhile): nothing to lose.
      templateForm.reset(result.savedValues);
      allowLeave();
      navigate(buildConsoleTemplatesPath());
      return;
    }

    rebaseTemplateEditorFormAfterSave(templateForm, {
      submitted,
      saved: result.savedValues,
    });
  };

  const handleLoadLatest = () => {
    if (templateForm.formState.isDirty && !window.confirm(EDITOR_LOAD_LATEST_MESSAGE)) {
      return;
    }

    setErrors([]);
    setEditConflict(false);
    model.reload();
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
        isUploading={hasPendingUploads}
        onCancel={() => navigate(buildConsoleTemplatesPath())}
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
              {editConflict ? (
                <Button className="mt-3" onClick={handleLoadLatest} size="sm" type="button" variant="outline">
                  Load latest version
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        </div>
      )}

      <TemplateEditorAccessNotices
        draft={access.draft}
        isStartingCheckout={access.isStartingCheckout}
        notice={access.notice}
        onDiscardDraft={access.discardDraft}
        onRestoreDraft={() => {
          const draftValues = access.restoreDraft();
          if (draftValues) {
            // Against the blank defaults, so the restored draft counts as unsaved.
            templateForm.reset(draftValues, { keepDefaultValues: true });
            handleSelectTemplateInfo();
          }
        }}
        onSignIn={access.signIn}
        onUpgrade={() => void access.startUpgrade()}
      />

      {/* A create leaves the page when it finishes, so edits made meanwhile could not
          be kept: lock the editor until then. An update keeps them (see handleSave). */}
      <fieldset
        className="m-0 min-w-0 border-0 p-0"
        disabled={shouldLockTemplateEditorWhileSaving({ id, isSaving: model.isSaving })}
      >
        {!id ? (
          <GenerateFromClipy
            onGenerated={(draft) => {
              templateForm.reset(draft, { keepDefaultValues: true });
              handleSelectTemplateInfo();
            }}
          />
        ) : null}

        <TemplateEditorUploadsContext.Provider value={uploads}>
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
        </TemplateEditorUploadsContext.Provider>
      </fieldset>

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
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {templateForm.watch("description")}
                </p>
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
