import { useEffect, useRef, useState } from "react";

import { useTemplateLists } from "@/contexts/TemplatesContext";
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
import type { ChecklistTemplate } from "@/types/checklist";

type TemplateEditorApiClient = Pick<typeof api, "getTemplateById">;

type TemplateEditorModelDependencies = {
  apiClient?: TemplateEditorApiClient;
  getCachedTemplate?: (id: string) => ChecklistTemplate | undefined;
  saveTemplate?: (input: SaveTemplateInput) => Promise<SaveTemplateResult>;
};

type TemplateEditorModelOptions = {
  id?: string;
};

type LoadTemplateEditorDataOptions = {
  id?: string;
  getCachedTemplate: (id: string) => ChecklistTemplate | undefined;
};

type SaveTemplateEditorDataOptions = {
  id?: string;
  expectedVersion?: number;
  // The slug the template has now; an unedited one is kept and not resent.
  storedSlug?: string;
  values: TemplateEditorFormValues;
};

type SaveTemplateEditorDependencies = {
  saveTemplate: (input: SaveTemplateInput) => Promise<SaveTemplateResult>;
};

export type TemplateEditorSaveResult = SaveTemplateResult & {
  // On success: the normalized values the server stored, the form's new baseline.
  savedValues?: TemplateEditorFormValues;
};

export type TemplateEditorLoadResult = {
  initialValues: TemplateEditorFormValues;
  loadError: string | null;
  templateSlug?: string;
  // The version of the same snapshot initialValues came from. Saves send it as
  // expected_version so a stale editor gets a conflict instead of overwriting.
  version?: number;
};

export const buildDefaultTemplateEditorTemplate =
  (): Partial<ChecklistTemplate> => ({});

export const buildTemplateEditorSavedState = (
  values: TemplateEditorFormValues,
  // savedSlug: the slug the API stored, which may carry a suffix the form lacks.
  slugs: { storedSlug?: string; savedSlug?: string } = {},
): TemplateEditorLoadResult => {
  const normalizedForm = normalizeTemplateEditorFormForSave(values, slugs);
  const slug = slugs.savedSlug ?? normalizedForm.seoUrl;

  return {
    initialValues: buildTemplateEditorFormValues({
      title: normalizedForm.title,
      description: normalizedForm.description,
      sections: normalizedForm.sections,
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

const buildLoadResult = (
  template?: Partial<ChecklistTemplate>,
): TemplateEditorLoadResult => ({
  initialValues: buildTemplateEditorFormValues(template),
  loadError: null,
  templateSlug: template?.slug ?? template?.seoUrl,
  version: template?.version,
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

export const loadTemplateEditorData = async (
  options: LoadTemplateEditorDataOptions,
  dependencies?: Pick<TemplateEditorModelDependencies, "apiClient">,
): Promise<TemplateEditorLoadResult> => {
  if (!options.id) {
    return buildLoadResult(buildDefaultTemplateEditorTemplate());
  }

  const cachedTemplate = options.getCachedTemplate(options.id);
  if (cachedTemplate) {
    return buildLoadResult(cachedTemplate);
  }

  try {
    const fetchedTemplate = await getApiClient(dependencies).getTemplateById(
      options.id,
    );

    return buildLoadResult(
      mapApiTemplateToChecklistTemplate(
        fetchedTemplate as Record<string, unknown>,
        options.id,
      ),
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
    isPublic: normalizedForm.isPublic,
  });
};

export const useTemplateEditorModel = (
  options: TemplateEditorModelOptions,
  dependencies?: TemplateEditorModelDependencies,
) => {
  const { getTemplate } = useTemplateLists();
  const {
    saveTemplate: persistTemplateSave,
    isSaving,
  } = useTemplateSave();
  const loadedTemplateIdRef = useRef<string | null>(null);
  // Set only from the loaded record and from save responses, never from the lists.
  const expectedVersionRef = useRef<number | undefined>(undefined);
  const baseGetTemplateRef = useRef(getTemplate);
  const apiClientRef = useRef<TemplateEditorApiClient | undefined>(
    dependencies?.apiClient,
  );
  const getCachedTemplateRef = useRef<
    ((id: string) => ChecklistTemplate | undefined) | undefined
  >(dependencies?.getCachedTemplate);
  const [initialValues, setInitialValues] = useState<TemplateEditorFormValues>(
    () => buildTemplateEditorFormValues(buildDefaultTemplateEditorTemplate()),
  );
  const [loading, setLoading] = useState(() => Boolean(options.id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateSlug, setTemplateSlug] = useState<string | undefined>();

  apiClientRef.current = dependencies?.apiClient;
  baseGetTemplateRef.current = getTemplate;
  getCachedTemplateRef.current = dependencies?.getCachedTemplate;

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
        {
          id: options.id,
          getCachedTemplate:
            getCachedTemplateRef.current ?? baseGetTemplateRef.current,
        },
        {
          apiClient: apiClientRef.current,
        },
      );

      if (cancelled) {
        return;
      }

      loadedTemplateIdRef.current = options.id;
      expectedVersionRef.current = result.version;
      setInitialValues(result.initialValues);
      setLoadError(result.loadError);
      setTemplateSlug(result.templateSlug);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [options.id]);

  // Returns the saved values instead of replacing initialValues: the page rebases the
  // form onto them, keeping any edits typed while the save was in flight.
  const save = async (
    values: TemplateEditorFormValues,
  ): Promise<TemplateEditorSaveResult> => {
    // A deep copy, so later typing into the same objects cannot leak into the saved state.
    const submitted = cloneTemplateEditorFormValues(values);
    const result = await saveTemplateEditorData(
      {
        id: options.id,
        expectedVersion: expectedVersionRef.current,
        storedSlug: templateSlug,
        values: submitted,
      },
      {
        saveTemplate: dependencies?.saveTemplate ?? persistTemplateSave,
      },
    );

    if (!result.success) {
      return result;
    }

    expectedVersionRef.current = result.version;
    const savedState = buildTemplateEditorSavedState(submitted, {
      storedSlug: templateSlug,
      savedSlug: result.slug,
    });
    setLoadError(null);
    setTemplateSlug(savedState.templateSlug || templateSlug);

    return { ...result, savedValues: savedState.initialValues };
  };

  return {
    initialValues,
    loading,
    loadError,
    save,
    isSaving,
    templateSlug,
  };
};
