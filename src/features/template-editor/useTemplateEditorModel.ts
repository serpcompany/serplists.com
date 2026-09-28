import { useEffect, useRef, useState } from "react";

import { mapApiTemplateToChecklistTemplate } from "@/features/template-detail/templateDetailMappers";
import { cloneTemplateEditorFormValues } from "@/features/template-editor/postSaveFormState";
import {
  type SaveTemplateInput,
  type SaveTemplateResult,
  useTemplateSave,
} from "@/hooks/useTemplateSave";
import {
  buildTemplateEditorFormValues,
  normalizeTemplateEditorFormForSave,
  type TemplateEditorFormValues,
  validateTemplateEditorFormForSave,
} from "@/lib/forms/templateEditorForm";
import { api } from "@/lib/api";
import { resolvePublicTemplateOwnerSlug } from "@/lib/routes";
import type { ChecklistTemplate } from "@/types/checklist";

type TemplateEditorApiClient = Pick<typeof api, "getTemplateById">;

type TemplateEditorModelDependencies = {
  apiClient?: TemplateEditorApiClient;
  saveTemplate?: (input: SaveTemplateInput) => Promise<SaveTemplateResult>;
};

type TemplateEditorModelOptions = {
  id?: string;
};

type LoadTemplateEditorDataOptions = {
  id?: string;
};

type SaveTemplateEditorDataOptions = {
  id?: string;
  expectedVersion?: number;
  // The slug the template has now; an unedited one is kept and not resent.
  storedSlug?: string;
  values: TemplateEditorFormValues;
  // The visibility the form was loaded or last saved with; unchanged, it is not resent.
  loadedIsPublic?: boolean;
};

type SaveTemplateEditorDependencies = {
  saveTemplate: (input: SaveTemplateInput) => Promise<SaveTemplateResult>;
};

export type TemplateEditorSaveResult = SaveTemplateResult & {
  // On success: the normalized values the server stored, the form's new baseline.
  savedValues?: TemplateEditorFormValues;
  // The editor moved on before the save finished; see shouldApplyTemplateEditorSaveResult.
  stale?: boolean;
};

export type TemplateEditorLoadResult = {
  initialValues: TemplateEditorFormValues;
  loadError: string | null;
  templateSlug?: string;
  // The version of the same snapshot initialValues came from. Saves send it as
  // expected_version so a stale editor gets a conflict instead of overwriting.
  version?: number;
  // A loaded template's public profile slug: its creator's username (also for an
  // Organization's template), or null when they have none. Absent for a new template.
  ownerSlug?: string | null;
};

export const buildDefaultTemplateEditorTemplate =
  (): Partial<ChecklistTemplate> => ({});

export const buildTemplateEditorSavedState = (
  values: TemplateEditorFormValues,
  // savedSlug: the slug the API stored, which may carry a suffix the form lacks.
  slugs: { storedSlug?: string; savedSlug?: string } = {},
  // The title and sections as sent after defaults (SaveTemplateResult.saved): what was
  // stored, which can differ from the form (an empty section gains a placeholder task).
  stored?: SaveTemplateResult["saved"],
): TemplateEditorLoadResult => {
  const normalizedForm = normalizeTemplateEditorFormForSave(values, slugs);
  // Without a slug from the API, an empty field means none was sent, so the template
  // kept the slug it had.
  const slug = slugs.savedSlug ?? (normalizedForm.seoUrl || slugs.storedSlug || "");

  return {
    initialValues: buildTemplateEditorFormValues({
      title: stored?.title ?? normalizedForm.title,
      description: normalizedForm.description,
      sections: stored?.sections ?? normalizedForm.sections,
      seoTitle: normalizedForm.seoTitle,
      seoDescription: normalizedForm.seoDescription,
      seoUrl: slug,
      slug,
      categories: normalizedForm.categories,
      tags: normalizedForm.tags,
      type: normalizedForm.templateType,
      isPublic: normalizedForm.isPublic,
    }),
    loadError: null,
    templateSlug: slug || undefined,
  };
};

export const shouldNavigateToTemplatesAfterSave = (params: {
  id?: string;
  result: SaveTemplateResult;
}): boolean => params.result.success && !params.id;

// The editor shows save failures inline, so only a successful save gets a toast. The shared
// template mutations never toast (see TemplatesContext), so this is the only one.
export const getTemplateSaveSuccessMessage = (params: {
  id?: string;
  result: SaveTemplateResult;
}): string | null => {
  if (!params.result.success) {
    return null;
  }
  return params.id ? "Template saved" : "Template created";
};

// A save result belongs to the editor that started it. The user may have moved on while it
// was saving ("New Template", another template, another page): the write still counts, but
// its form state, errors and navigation must not reach the page they moved to.
export const shouldApplyTemplateEditorSaveResult = (params: {
  requestedId?: string;
  currentId?: string;
  mounted: boolean;
}): boolean => params.mounted && params.requestedId === params.currentId;

export type TemplateSaveFeedback = {
  successMessage: string | null;
  errorMessage: string | null;
  navigateToTemplates: boolean;
  // Null leaves the form's errors as they are.
  inlineErrors: SaveTemplateResult["errors"] | null;
};

// What the editor page does with a save result. A stale save still reports its outcome as a
// toast (a failure must not be silent), but never touches the form or navigates.
export const resolveTemplateSaveFeedback = (params: {
  id?: string;
  result: TemplateEditorSaveResult;
}): TemplateSaveFeedback => {
  const successMessage = getTemplateSaveSuccessMessage(params);
  if (params.result.stale) {
    const failure = params.result.success ? null : params.result.errors[0]?.message ?? "Failed to save template";
    return {
      successMessage,
      errorMessage: failure ? `Template not saved: ${failure}` : null,
      navigateToTemplates: false,
      inlineErrors: null,
    };
  }
  return {
    successMessage,
    errorMessage: null,
    navigateToTemplates: shouldNavigateToTemplatesAfterSave(params),
    inlineErrors: params.result.errors,
  };
};

const buildLoadResult = (
  template?: Partial<ChecklistTemplate>,
  // The sections as stored, when they differ from template.sections (see below).
  storedSections: unknown = template?.sections,
): TemplateEditorLoadResult => ({
  initialValues: buildTemplateEditorFormValues({ ...template, sections: storedSections }),
  loadError: null,
  templateSlug: template?.slug ?? template?.seoUrl,
  version: template?.version,
  ownerSlug: template?.id
    ? resolvePublicTemplateOwnerSlug({
        id: template.id,
        userId: template.userId ?? "",
        ownerProfile: template.ownerProfile,
      })
    : undefined,
});

const getApiClient = (
  dependencies?: TemplateEditorModelDependencies,
): TemplateEditorApiClient => dependencies?.apiClient ?? api;

export const shouldLoadTemplateEditorRecord = (
  requestedId: string | undefined,
  loadedId: string | null,
): boolean => {
  if (!requestedId) {
    return false;
  }

  return requestedId !== loadedId;
};

// Always loads the template by id. The template lists are not a source: they can be
// minutes old, so a teammate's (or another tab's) newer save would be missing from the
// form, and the save would end in a conflict. A failed load is reported, never
// replaced by a cached copy.
export const loadTemplateEditorData = async (
  options: LoadTemplateEditorDataOptions,
  dependencies?: Pick<TemplateEditorModelDependencies, "apiClient">,
): Promise<TemplateEditorLoadResult> => {
  if (!options.id) {
    return buildLoadResult(buildDefaultTemplateEditorTemplate());
  }

  try {
    const fetchedTemplate = (await getApiClient(dependencies).getTemplateById(
      options.id,
    )) as Record<string, unknown>;
    const template = mapApiTemplateToChecklistTemplate(fetchedTemplate, options.id);

    // The mapper makes sections safe to display, which drops what no page renders (a
    // block of unknown type, a value that is not text). The form reads the stored
    // sections instead and keeps that content, so saving never deletes it.
    return buildLoadResult(
      template,
      Array.isArray(fetchedTemplate.sections) ? fetchedTemplate.sections : template.sections,
    );
  } catch (error) {
    return {
      initialValues: buildTemplateEditorFormValues(),
      loadError:
        error instanceof Error ? error.message : "Failed to load template",
      templateSlug: undefined,
    };
  }
};

export const saveTemplateEditorData = async (
  options: SaveTemplateEditorDataOptions,
  dependencies: SaveTemplateEditorDependencies,
): Promise<SaveTemplateResult> => {
  const normalizedForm = normalizeTemplateEditorFormForSave(options.values, {
    storedSlug: options.storedSlug,
  });
  const validationErrors = validateTemplateEditorFormForSave(normalizedForm);
  if (validationErrors.length > 0) {
    return { success: false, errors: validationErrors };
  }
  // An update resends visibility only when the editor's switch changed it, so a Share made
  // in another tab after this editor loaded is never undone.
  const visibilityUnchanged = Boolean(options.id) && options.loadedIsPublic === normalizedForm.isPublic;

  return dependencies.saveTemplate({
    id: options.id,
    expectedVersion: options.expectedVersion,
    storedSlug: options.storedSlug,
    title: normalizedForm.title,
    description: normalizedForm.description,
    sections: normalizedForm.sections,
    seoTitle: normalizedForm.seoTitle,
    seoDescription: normalizedForm.seoDescription,
    seoUrl: normalizedForm.seoUrl,
    templateType: normalizedForm.templateType,
    categories: normalizedForm.categories,
    tags: normalizedForm.tags,
    isPublic: visibilityUnchanged ? undefined : normalizedForm.isPublic,
  });
};

export const useTemplateEditorModel = (
  options: TemplateEditorModelOptions,
  dependencies?: TemplateEditorModelDependencies,
) => {
  const {
    saveTemplate: persistTemplateSave,
    isSaving,
  } = useTemplateSave();
  const loadedTemplateIdRef = useRef<string | null>(null);
  // Set only from the loaded record and from save responses, never from the lists.
  const expectedVersionRef = useRef<number | undefined>(undefined);
  const currentIdRef = useRef(options.id);
  // True until unmount (the effect sets it again on StrictMode's remount).
  const mountedRef = useRef(true);
  // The visibility the form was loaded or last saved with (see saveTemplateEditorData).
  const loadedIsPublicRef = useRef<boolean | undefined>(undefined);
  const apiClientRef = useRef<TemplateEditorApiClient | undefined>(
    dependencies?.apiClient,
  );
  // Bumped by reload(), which loads the same template again (after a save conflict).
  const [reloadCount, setReloadCount] = useState(0);
  const [initialValues, setInitialValues] = useState<TemplateEditorFormValues>(
    () => buildTemplateEditorFormValues(buildDefaultTemplateEditorTemplate()),
  );
  const [loading, setLoading] = useState(() => Boolean(options.id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateSlug, setTemplateSlug] = useState<string | undefined>();
  const [ownerSlug, setOwnerSlug] = useState<string | null | undefined>();

  apiClientRef.current = dependencies?.apiClient;
  currentIdRef.current = options.id;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!options.id) {
        loadedTemplateIdRef.current = null;
        expectedVersionRef.current = undefined;
        setInitialValues(
          buildTemplateEditorFormValues(buildDefaultTemplateEditorTemplate()),
        );
        setLoadError(null);
        setTemplateSlug(undefined);
        setOwnerSlug(undefined);
        setLoading(false);
        return;
      }

      if (!shouldLoadTemplateEditorRecord(options.id, loadedTemplateIdRef.current)) {
        setLoading(false);
        return;
      }

      setLoading(true);
      expectedVersionRef.current = undefined;

      const result = await loadTemplateEditorData(
        { id: options.id },
        { apiClient: apiClientRef.current },
      );

      if (cancelled) {
        return;
      }

      loadedTemplateIdRef.current = options.id;
      expectedVersionRef.current = result.version;
      loadedIsPublicRef.current = result.loadError ? undefined : result.initialValues.isPublic;
      setInitialValues(result.initialValues);
      setLoadError(result.loadError);
      setTemplateSlug(result.templateSlug);
      setOwnerSlug(result.ownerSlug);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [options.id, reloadCount]);

  // Loads the saved template again, replacing the form (the caller confirms first).
  const reload = () => {
    loadedTemplateIdRef.current = null;
    setReloadCount((count) => count + 1);
  };

  // Returns the saved values instead of replacing initialValues: the page rebases the
  // form onto them, keeping any edits typed while the save was in flight.
  const save = async (
    values: TemplateEditorFormValues,
  ): Promise<TemplateEditorSaveResult> => {
    // A deep copy, so later typing into the same objects cannot leak into the saved state.
    const submitted = cloneTemplateEditorFormValues(values);
    const requestedId = options.id;
    const result = await saveTemplateEditorData(
      {
        id: requestedId,
        expectedVersion: expectedVersionRef.current,
        loadedIsPublic: loadedIsPublicRef.current,
        storedSlug: templateSlug,
        values: submitted,
      },
      {
        saveTemplate: dependencies?.saveTemplate ?? persistTemplateSave,
      },
    );

    // The editor moved on: its version and form state belong to what it shows now.
    if (
      !shouldApplyTemplateEditorSaveResult({
        requestedId,
        currentId: currentIdRef.current,
        mounted: mountedRef.current,
      })
    ) {
      return { ...result, stale: true };
    }

    if (!result.success) {
      return result;
    }

    expectedVersionRef.current = result.version;
    const savedState = buildTemplateEditorSavedState(
      submitted,
      { storedSlug: templateSlug, savedSlug: result.slug },
      result.saved,
    );
    loadedIsPublicRef.current = savedState.initialValues.isPublic;
    setLoadError(null);
    setTemplateSlug(savedState.templateSlug || templateSlug);

    return { ...result, savedValues: savedState.initialValues };
  };

  return {
    initialValues,
    loading,
    loadError,
    reload,
    save,
    isSaving,
    ownerSlug,
    templateSlug,
  };
};
