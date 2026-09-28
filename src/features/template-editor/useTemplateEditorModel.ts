import { useEffect, useRef, useState } from "react";

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
import type { TemplateUpdateResult } from "@/lib/templateUpdateResult";
import type { ChecklistTemplate, TemplateRule } from "@/types/checklist";

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

// What the next save needs from the stored template: its version (sent as expected_version)
// and its rules, which the editor does not edit.
export type TemplateEditorBaseline = {
  version?: number;
  rules?: TemplateRule[];
};

type SaveTemplateEditorDataOptions = {
  id?: string;
  values: TemplateEditorFormValues;
  baseline?: TemplateEditorBaseline;
};

type SaveTemplateEditorDependencies = {
  saveTemplate: (input: SaveTemplateInput) => Promise<SaveTemplateResult>;
};

export type TemplateEditorLoadResult = {
  initialValues: TemplateEditorFormValues;
  loadError: string | null;
  templateSlug?: string;
  baseline: TemplateEditorBaseline;
};

export const buildDefaultTemplateEditorTemplate =
  (): Partial<ChecklistTemplate> => ({});

// After a save, the form shows what was stored. `saved` is the PUT answer of an update: its
// slug may carry a -<id8> suffix when the requested one was taken.
export const buildTemplateEditorSavedState = (
  values: TemplateEditorFormValues,
  saved?: TemplateUpdateResult,
): Omit<TemplateEditorLoadResult, "baseline"> => {
  const normalizedForm = normalizeTemplateEditorFormForSave(values);
  const storedSlug = saved?.slug || normalizedForm.seoUrl;

  return {
    initialValues: buildTemplateEditorFormValues({
      title: normalizedForm.title,
      description: normalizedForm.description,
      sections: normalizedForm.sections,
      seoTitle: normalizedForm.seoTitle,
      seoDescription: normalizedForm.seoDescription,
      seoUrl: storedSlug,
      slug: storedSlug,
      categories: normalizedForm.categories,
      tags: normalizedForm.tags,
      type: normalizedForm.templateType,
      isPublic: normalizedForm.isPublic,
    }),
    loadError: null,
    templateSlug: storedSlug || undefined,
  };
};

// The baseline for the next save: the version the server stored, never a local +1. A failed
// save (such as a 409 edit conflict) keeps the loaded version.
export const applyTemplateEditorSave = (
  baseline: TemplateEditorBaseline,
  result: SaveTemplateResult,
): TemplateEditorBaseline =>
  result.success && result.saved ? { ...baseline, version: result.saved.version } : baseline;

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

const buildLoadResult = (
  template?: Partial<ChecklistTemplate>,
): TemplateEditorLoadResult => ({
  initialValues: buildTemplateEditorFormValues(template),
  loadError: null,
  templateSlug: template?.slug ?? template?.seoUrl,
  baseline: { version: template?.version, rules: template?.rules },
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

// Always loads by id: a cached list copy can be minutes old, and its version would make the
// first save fail with an edit conflict (or, if missing, skip the conflict check).
export const loadTemplateEditorData = async (
  options: LoadTemplateEditorDataOptions,
  dependencies?: Pick<TemplateEditorModelDependencies, "apiClient">,
): Promise<TemplateEditorLoadResult> => {
  if (!options.id) {
    return buildLoadResult(buildDefaultTemplateEditorTemplate());
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
      baseline: {},
    };
  }
};

export const saveTemplateEditorData = async (
  options: SaveTemplateEditorDataOptions,
  dependencies: SaveTemplateEditorDependencies,
): Promise<SaveTemplateResult> => {
  const normalizedForm = normalizeTemplateEditorFormForSave(options.values);
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
    isPublic: normalizedForm.isPublic,
    ...(options.id ? { version: options.baseline?.version, rules: options.baseline?.rules } : {}),
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
  const baselineRef = useRef<TemplateEditorBaseline>({});
  const apiClientRef = useRef<TemplateEditorApiClient | undefined>(
    dependencies?.apiClient,
  );
  const [initialValues, setInitialValues] = useState<TemplateEditorFormValues>(
    () => buildTemplateEditorFormValues(buildDefaultTemplateEditorTemplate()),
  );
  const [loading, setLoading] = useState(() => Boolean(options.id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateSlug, setTemplateSlug] = useState<string | undefined>();

  apiClientRef.current = dependencies?.apiClient;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!options.id) {
        loadedTemplateIdRef.current = null;
        baselineRef.current = {};
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
        },
        {
          apiClient: apiClientRef.current,
        },
      );

      if (cancelled) {
        return;
      }

      loadedTemplateIdRef.current = options.id;
      baselineRef.current = result.baseline;
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
        baseline: baselineRef.current,
      },
      {
        saveTemplate: dependencies?.saveTemplate ?? persistTemplateSave,
      },
    );

    if (result.success) {
      // Kept before isSaving clears, so a quick second save sends the stored version.
      baselineRef.current = applyTemplateEditorSave(baselineRef.current, result);
      const savedState = buildTemplateEditorSavedState(values, result.saved);
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
