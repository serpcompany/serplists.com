'use client';

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ListTree } from "lucide-react";
import { toast } from "sonner";
import {
  resolveTemplateSaveFeedback,
  shouldLockTemplateEditorWhileSaving,
  shouldNavigateToTemplatesAfterSave,
  type TemplateSaveFeedback,
  useTemplateEditorModel,
} from "@/features/template-editor/useTemplateEditorModel";
import { useTemplateEditorState } from "@/hooks/useTemplateEditorState";
import { useAppRouter } from "@/lib/navigation/useAppRouter";
import { TemplateHeader } from "@/components/template-editor/TemplateHeader";
import { TemplateEditorOutline } from "@/components/template-editor/TemplateEditorOutline";
import { TemplatePreviewDialog } from "@/components/template-editor/TemplatePreviewDialog";
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
  DashboardContentShell,
  DashboardLoadingState,
} from "@/components/dashboard/DashboardContentShell";
import { PageContainer } from "@/components/layout/page-shell";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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

type TemplateEditorModel = ReturnType<typeof useTemplateEditorModel>;

const OUTLINE_BESIDE_FORM_QUERY = "(min-width: 1024px)";

const TemplateEditorLoading = () => (
  <DashboardContentShell>
    <DashboardLoadingState />
  </DashboardContentShell>
);

const showTemplateSaveToasts = (feedback: TemplateSaveFeedback) => {
  if (feedback.successMessage) {
    toast.success(feedback.successMessage);
  }
  if (feedback.errorMessage) {
    toast.error(feedback.errorMessage);
  }
};

type TemplateEditorFormProps = {
  id: string | undefined;
  model: TemplateEditorModel;
};

const TemplateEditorForm = ({ id, model }: TemplateEditorFormProps) => {
  const router = useAppRouter();
  const { user } = useAuth();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const isOutlineBesideForm = useMediaQuery(OUTLINE_BESIDE_FORM_QUERY);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [editConflict, setEditConflict] = useState(false);
  const [isGeneratingClipyDraft, setIsGeneratingClipyDraft] = useState(false);
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
  const [draftTitle, draftDescription, draftSections] = useWatch({
    control: templateForm.control,
    name: ["title", "description", "sections"],
  });
  const { uploads, pendingCount } = usePendingTemplateEditorUploads();
  const hasPendingUploads = pendingCount > 0;
  const shouldBlockNavigation = shouldBlockTemplateEditorNavigation({
    isDirty: templateForm.formState.isDirty,
    loading: model.loading,
    hasPendingUploads,
  });

  useEffect(() => {
    templateForm.reset(model.initialValues);
  }, [model.initialValues, templateForm]);

  const keepWorkOnSessionEndRef = useRef<() => boolean>(() => false);
  const { allowLeave, guardLeave } = useTemplateEditorLeaveGuard(
    shouldBlockNavigation,
    getTemplateEditorLeaveMessage({ hasPendingUploads, isSaving: model.isSaving }),
    () => keepWorkOnSessionEndRef.current(),
  );
  const access = useTemplateEditorAccess({
    isCreate: !id,
    templateId: id,
    getValues: templateForm.getValues,
    getVersion: model.getVersion,
    allowLeave,
    guardLeave,
  });
  const isDirty = templateForm.formState.isDirty;
  useEffect(() => {
    keepWorkOnSessionEndRef.current = () => !isDirty || access.keepDraft();
  });

  const fillFormAsUnsavedWork = (values: TemplateEditorFormValues) => {
    templateForm.reset(values, { keepDefaultValues: true });
    handleSelectTemplateInfo();
  };

  const handleSave = async () => {
    if (uploads.count() > 0 || isGeneratingClipyDraft) {
      return;
    }

    const submitted = cloneTemplateEditorFormValues(templateForm.getValues());
    const visit = beginVisit();
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

    setErrors(access.handleSaveResult(result) ? [] : result.errors);
    setEditConflict(Boolean(result.editConflict));
    if (!result.success || !result.savedValues) {
      return;
    }

    if (shouldNavigateToTemplatesAfterSave({ id, result })) {
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

  const isLocked =
    shouldLockTemplateEditorWhileSaving({ id, isSaving: model.isSaving }) || isGeneratingClipyDraft;
  return (
    <div className="flex min-w-0 flex-col" data-template-editor="true">
      <TemplateHeader
        isEditing={!!id}
        isSaving={model.isSaving}
        isGenerating={isGeneratingClipyDraft}
        isUploading={hasPendingUploads}
        onCancel={() => router.push(buildConsoleTemplatesPath())}
        onPreview={() => setIsPreviewOpen(true)}
        onSave={handleSave}
        outlineTrigger={
          isOutlineBesideForm ? undefined : (
            <Button
              disabled={isLocked}
              onClick={() => setIsOutlineOpen(true)}
              type="button"
              variant="outline"
            >
              <ListTree data-icon="inline-start" />
              Outline
            </Button>
          )
        }
        templateSlug={model.templateSlug}
        title={draftTitle || "New Template"}
      />

      <PageContainer className="flex flex-col gap-6 py-6">
        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle />
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
        )}

        <TemplateEditorAccessNotices
          draft={access.draft}
          draftActionsDisabled={isLocked}
          isStartingCheckout={access.isStartingCheckout}
          notice={access.notice}
          onDiscardDraft={access.discardDraft}
          onRestoreDraft={() => {
            restoreKeptTemplateDraft({
              hasUnsavedWork: templateForm.formState.isDirty || uploads.count() > 0,
              takeDraft: access.restoreDraft,
              apply: (restored) => {
                fillFormAsUnsavedWork(restored.values);
                if (id && restored.baseVersion !== undefined) {
                  model.setVersion(restored.baseVersion);
                }
              },
            });
          }}
          onSignIn={access.signIn}
          onUpgrade={() => void access.startUpgrade()}
          otherContextDraft={access.otherContextDraft}
          onSwitchToDraftContext={access.switchToDraftContext}
          onDiscardOtherContextDraft={access.discardOtherContextDraft}
        />

        <fieldset className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0" disabled={isLocked}>
          {!id ? (
            <GenerateFromClipy
              confirmReplace={() => confirmReplaceTemplateDraft(templateForm.formState.isDirty)}
              onGeneratingChange={setIsGeneratingClipyDraft}
              onGenerated={fillFormAsUnsavedWork}
            />
          ) : null}

          <TemplateEditorUploadsContext.Provider value={uploads}>
            <FormProvider {...templateForm}>
              <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <TemplateEditorOutline
                  besideForm={isOutlineBesideForm}
                  locked={isLocked}
                  onSheetOpenChange={setIsOutlineOpen}
                  sheetOpen={isOutlineOpen}
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
      </PageContainer>

      <TemplatePreviewDialog
        description={draftDescription}
        onOpenChange={setIsPreviewOpen}
        open={isPreviewOpen}
        sections={draftSections}
        title={draftTitle}
      />
    </div>
  );
};

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
    return <TemplateEditorLoading />;
  }

  if (model.loadError) {
    return (
      <DashboardContentShell width="narrow">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Unable to load template</AlertTitle>
          <AlertDescription>{model.loadError}</AlertDescription>
        </Alert>
        <div>
          <Button variant="outline" onClick={() => router.push(buildConsoleTemplatesPath())}>
            Back to Templates
          </Button>
        </div>
      </DashboardContentShell>
    );
  }

  if (permission === "checking") {
    return <TemplateEditorLoading />;
  }

  if (permission !== "editable") {
    return <TemplateEditorReadOnlyNotice reason={permission} templateId={id} />;
  }

  return <TemplateEditorForm id={id} key={id ?? "new"} model={model} />;
};

export default TemplateEditor;
