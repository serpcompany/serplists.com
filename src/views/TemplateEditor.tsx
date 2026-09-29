'use client';

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  resolveTemplateSaveFeedback,
  type TemplateSaveFeedback,
  useTemplateEditorModel,
} from "@/features/template-editor/useTemplateEditorModel";
import { useTemplateEditorState } from "@/hooks/useTemplateEditorState";
import { useAppRouter } from "@/lib/navigation/useAppRouter";
import { TemplateHeader } from "@/components/template-editor/TemplateHeader";
import { OutlineSidebar } from "@/components/template-editor/OutlineSidebar";
import { EditorPanels } from "@/components/template-editor/EditorPanels";
import { GenerateFromClipy } from "@/components/template-editor/GenerateFromClipy";
import { buildConsoleTemplatesPath } from "@/lib/routes";
import { resolveTemplateEditorOwnerSlug } from "@/lib/templates/templateSeoPreview";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { usePageVisit } from "@/hooks/usePageVisit";
import {
  templateEditorFormSchema,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
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
  confirmReplaceTemplateDraft,
  getTemplateEditorLeaveMessage,
  restoreKeptTemplateDraft,
  shouldBlockTemplateEditorNavigation,
} from "@/features/template-editor/navigationGuards";
import {
  TemplateEditorUploadsContext,
  usePendingTemplateEditorUploads,
} from "@/features/template-editor/pendingUploads";
import { useTemplateEditorLeaveGuard } from "@/features/template-editor/useTemplateEditorLeaveGuard";
import { useTemplateEditorAccess } from "@/features/template-editor/useTemplateEditorAccess";
import { saveTemplateForVisit } from "@/features/template-editor/saveForVisit";
import { TemplateEditorAccessNotices } from "@/components/template-editor/TemplateEditorAccessNotices";
import { TemplateEditorReadOnlyNotice } from "@/components/template-editor/TemplateEditorReadOnlyNotice";
import { useTemplateEditPermission } from "@/features/template-editor/useTemplateEditPermission";

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

type TemplateEditorModel = ReturnType<typeof useTemplateEditorModel>;

// The shared template mutations never toast, so the editor reports its own saves: a
// success always, a failure only for a save the user left (the editor shows it inline).
const showTemplateSaveToasts = (feedback: TemplateSaveFeedback) => {
  if (feedback.successMessage) {
    toast.success(feedback.successMessage);
  }
  if (feedback.errorMessage) {
    toast.error(feedback.errorMessage);
  }
};

type TemplateEditorFormProps = {
  id?: string;
  model: TemplateEditorModel;
};

// Mounted only once the template has loaded (see TemplateEditor), so the form, the
// outline, and the header start from the loaded values.
const TemplateEditorForm = ({ id, model }: TemplateEditorFormProps) => {
  const router = useAppRouter();
  const { user } = useAuth();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  // The last save was refused because someone saved the template after it loaded.
  const [editConflict, setEditConflict] = useState(false);
  // A Clipy draft is being generated; it replaces the form when it arrives.
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  // A save that finishes after the user left must not act on the page (a create's
  // redirect would pull them off the page they went to). Only leaving the path counts:
  // the sidebar's New Template link here keeps this editor mounted, and a create in
  // flight must still leave for My Templates, not stay here as unsaved work.
  const beginVisit = usePageVisit({ endOn: "pathname" });
  
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
  // The header and the preview show the draft as it is typed.
  const [draftTitle, draftDescription, draftSections] = useWatch({
    control: templateForm.control,
    name: ["title", "description", "sections"],
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

  // The form starts from model.initialValues; this follows a later change (the new
  // template's defaults are set once the model mounts).
  useEffect(() => {
    templateForm.reset(model.initialValues);
  }, [model.initialValues, templateForm]);

  // Keeps the edits when the session ends in the background (set below, once access exists).
  const keepWorkRef = useRef<() => boolean>(() => false);
  // Leaving during a save still asks: the save can fail, and the edits are only here.
  const { allowLeave, guardLeave } = useTemplateEditorLeaveGuard(
    shouldBlockNavigation,
    getTemplateEditorLeaveMessage({ hasPendingUploads, isSaving: model.isSaving }),
    () => keepWorkRef.current(),
  );
  // Plan limits and an ended session: the upgrade or sign-in action, and the kept draft.
  const access = useTemplateEditorAccess({
    isCreate: !id,
    templateId: id,
    getValues: templateForm.getValues,
    getVersion: model.getVersion,
    allowLeave,
    guardLeave,
  });
  // A file still uploading is lost with the session; only form edits are kept.
  const isDirty = templateForm.formState.isDirty;
  useEffect(() => {
    keepWorkRef.current = () => !isDirty || access.keepDraft();
  });

  const handleSave = async () => {
    // Save is disabled meanwhile; this also covers a call that skips the button.
    if (uploads.count() > 0 || isGeneratingDraft) {
      return;
    }

    // model.save validates first and returns errors that name the field; the alert
    // below shows them. The copy is what gets sent; the form stays editable meanwhile.
    const submitted = cloneTemplateEditorFormValues(templateForm.getValues());
    const visit = beginVisit();
    // The kept draft is settled, and the outcome toasted, even when the user chose to
    // leave while it saved (a failure must not be silent); the rest (errors, notices,
    // the redirect) happens only while they are still here.
    const result = await saveTemplateForVisit({
      visit,
      save: () => model.save(submitted),
      settle: (finished) => {
        access.settleDraft(finished, submitted);
        const stale = Boolean(finished.stale) || !visit.isCurrent();
        showTemplateSaveToasts(resolveTemplateSaveFeedback({ id, result: { ...finished, stale } }));
      },
    });
    if (!result || result.stale) {
      return;
    }

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
      router.push(buildConsoleTemplatesPath());
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

  return (
    <div className="min-h-screen bg-background">
      <TemplateHeader
        isEditing={!!id}
        isSaving={model.isSaving}
        isGenerating={isGeneratingDraft}
        isUploading={hasPendingUploads}
        onCancel={() => router.push(buildConsoleTemplatesPath())}
        onPreview={() => setIsPreviewOpen(true)}
        onSave={handleSave}
        templateSlug={model.templateSlug}
        title={draftTitle || "New Template"}
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
        // The notices sit outside the locked fieldset: a restore during a create would be
        // wiped when it finishes, and a Clipy draft arriving later would replace it.
        draftActionsDisabled={
          shouldLockTemplateEditorWhileSaving({ id, isSaving: model.isSaving }) ||
          isGeneratingDraft
        }
        isStartingCheckout={access.isStartingCheckout}
        notice={access.notice}
        onDiscardDraft={access.discardDraft}
        onRestoreDraft={() => {
          // Work typed since the page opened is replaced only on a yes.
          restoreKeptTemplateDraft({
            hasUnsavedWork: templateForm.formState.isDirty || uploads.count() > 0,
            takeDraft: access.restoreDraft,
            apply: (restored) => {
              // Against the blank (or loaded) defaults, so the restored draft counts as unsaved.
              templateForm.reset(restored.values, { keepDefaultValues: true });
              // Edits to an existing template save against the version they were made on.
              if (id && restored.baseVersion !== undefined) {
                model.setVersion(restored.baseVersion);
              }
              handleSelectTemplateInfo();
            },
          });
        }}
        onSignIn={access.signIn}
        onUpgrade={() => void access.startUpgrade()}
        otherContextDraft={access.otherContextDraft}
        onSwitchToDraftContext={access.switchToDraftContext}
        onDiscardOtherContextDraft={access.discardOtherContextDraft}
      />

      {/* A create leaves the page when it finishes, so edits made meanwhile could not
          be kept: lock the editor until then. An update keeps them (see handleSave).
          A generated Clipy draft replaces the form, so it is locked while that runs. */}
      <fieldset
        className="m-0 min-w-0 border-0 p-0"
        disabled={
          shouldLockTemplateEditorWhileSaving({ id, isSaving: model.isSaving }) ||
          isGeneratingDraft
        }
      >
        {!id ? (
          <GenerateFromClipy
            // Unsaved work (typed, restored, or an earlier draft) is replaced only on a yes.
            confirmReplace={() => confirmReplaceTemplateDraft(templateForm.formState.isDirty)}
            onGeneratingChange={setIsGeneratingDraft}
            onGenerated={(draft) => {
              // Against the blank defaults, so the draft counts as unsaved.
              templateForm.reset(draft, { keepDefaultValues: true });
              handleSelectTemplateInfo();
            }}
          />
        ) : null}

        <TemplateEditorUploadsContext.Provider value={uploads}>
          <FormProvider {...templateForm}>
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
                publicOwnerSlug={resolveTemplateEditorOwnerSlug({
                  isNew: !id,
                  loadedOwnerSlug: model.ownerSlug,
                  viewerUsername: user?.username,
                })}
                selectedItemIndex={selectedItemIndex}
                selectedSectionIndex={selectedSectionIndex}
                showingSEO={showingSEO}
                showingTemplateInfo={showingTemplateInfo}
              />
            </div>
          </FormProvider>
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
                {draftTitle || "Untitled Template"}
              </h2>
              {draftDescription ? (
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {draftDescription}
                </p>
              ) : null}
            </div>
            <PublicTemplateContent
              initialExpandedItems={Object.fromEntries(
                draftSections
                  .flatMap((section, sectionIndex) =>
                    section.items.map((_, itemIndex) => [
                      `${sectionIndex}-${itemIndex}`,
                      true,
                    ]),
                  ),
              )}
              sections={draftSections}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Shows the spinner or the load error, and creates the editor only once the template
// has loaded. A form created earlier would start from the blank defaults and be reset
// after the outline mounted, so the first frame showed "New Template" and one empty
// section. Reloading (Load latest version) passes through loading again, which
// remounts the editor with the reloaded values. A viewer who cannot save this template
// (their Organization role, or someone else's template) gets a notice instead.
const TemplateEditor = () => {
  const { id } = useParams<{ id?: string }>();
  const router = useAppRouter();
  const model = useTemplateEditorModel({ id });
  const permission = useTemplateEditPermission({
    isCreate: !id,
    loading: model.loading,
    ownership: model.ownership,
  });

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
          <Button variant="outline" onClick={() => router.push(buildConsoleTemplatesPath())}>
            Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  if (permission === "checking") {
    return (
      <div className="flex h-52 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (permission !== "editable") {
    return <TemplateEditorReadOnlyNotice reason={permission} templateId={id} />;
  }

  return <TemplateEditorForm id={id} key={id ?? "new"} model={model} />;
};

export default TemplateEditor;
