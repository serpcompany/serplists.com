import { useEffect, useRef, useState } from "react";

import { useTemplateLists } from "@/contexts/TemplatesContext";
import { mapApiTemplateToChecklistTemplate } from "@/features/template-detail/templateDetailMappers";
import {
  type SaveTemplateInput,
  type SaveTemplateResult,
  useTemplateSave,
} from "@/hooks/useTemplateSave";
import {
  buildTemplateEditorFormValues,
  normalizeTemplateEditorFormForSave,
  type TemplateEditorFormValues,
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
  values: TemplateEditorFormValues;
  // What the form was loaded (or last saved) from: an update is guarded by this version and
  // resends visibility only when the form changed it.
  baseline?: { version?: number; isPublic: boolean };
};

type SaveTemplateEditorDependencies = {
  saveTemplate: (input: SaveTemplateInput) => Promise<SaveTemplateResult>;
};

export type TemplateEditorLoadResult = {
  initialValues: TemplateEditorFormValues;
  loadError: string | null;
  templateSlug?: string;
  version?: number;
};

export const buildDefaultTemplateEditorTemplate =
  (): Partial<ChecklistTemplate> => ({});

export const buildTemplateEditorSavedState = (
  values: TemplateEditorFormValues,
  version?: number,
): TemplateEditorLoadResult => {
  const normalizedForm = normalizeTemplateEditorFormForSave(values);

  return {
    initialValues: buildTemplateEditorFormValues({
      title: normalizedForm.title,
      description: normalizedForm.description,
      sections: normalizedForm.sections,
      seoTitle: normalizedForm.seoTitle,
      seoDescription: normalizedForm.seoDescription,
      seoUrl: normalizedForm.seoUrl,
      slug: normalizedForm.seoUrl,
      categories: normalizedForm.categories,
      tags: normalizedForm.tags,
      type: normalizedForm.templateType,
      isPublic: normalizedForm.isPublic,
    }),
    loadError: null,
    templateSlug: normalizedForm.seoUrl || undefined,
    version,
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
  const normalizedForm = normalizeTemplateEditorFormForSave(options.values);
  const visibilityUnchanged = Boolean(options.id && options.baseline && options.baseline.isPublic === normalizedForm.isPublic);
  return dependencies.saveTemplate({
    id: options.id,
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
    version: options.id ? options.baseline?.version : undefined,
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
  // The version the form was loaded or last saved at (see saveTemplateEditorData).
  const loadedVersionRef = useRef<number | undefined>(undefined);
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
      loadedVersionRef.current = result.version;
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

  const save = async (
    values: TemplateEditorFormValues,
  ): Promise<SaveTemplateResult> => {
    const result = await saveTemplateEditorData(
      {
        id: options.id,
        values,
        baseline: { version: loadedVersionRef.current, isPublic: initialValues.isPublic },
      },
      {
        saveTemplate: dependencies?.saveTemplate ?? persistTemplateSave,
      },
    );

    if (result.success) {
      const savedState = buildTemplateEditorSavedState(values, result.version);
      loadedVersionRef.current = savedState.version;
      setInitialValues(savedState.initialValues);
      setLoadError(null);
      setTemplateSlug(savedState.templateSlug || templateSlug);
    }

    return result;
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
