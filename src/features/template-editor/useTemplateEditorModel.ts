import { useEffect, useRef, useState } from "react";

import { useTemplates } from "@/contexts/TemplatesContext";
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
import { preserveTemplateEditorExtensions } from '@/lib/forms/templateEditorExtensions';
import { normalizeSections, InvalidChecklistContentError } from '@/lib/utils/checklistSections';

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
  sourceSections?: ChecklistTemplate['sections'];
};

type SaveTemplateEditorDependencies = {
  saveTemplate: (input: SaveTemplateInput) => Promise<SaveTemplateResult>;
};

export type TemplateEditorLoadResult = {
  initialValues: TemplateEditorFormValues;
  loadError: string | null;
  templateSlug?: string;
  sourceSections?: ChecklistTemplate['sections'];
};

export const buildDefaultTemplateEditorTemplate =
  (): Partial<ChecklistTemplate> => ({});

export const buildTemplateEditorSavedState = (
  values: TemplateEditorFormValues,
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
  };
};

export const shouldNavigateToTemplatesAfterSave = (params: {
  id?: string;
  result: SaveTemplateResult;
}): boolean => params.result.success && !params.id;

const buildLoadResult = (
  template?: Partial<ChecklistTemplate>,
): TemplateEditorLoadResult => {
  const sourceSections = normalizeSections(template?.sections ?? []);
  return {
  initialValues: buildTemplateEditorFormValues({ ...template, sections: sourceSections }),
  sourceSections,
  loadError: null,
  templateSlug: template?.slug ?? template?.seoUrl,
  };
};

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

  try {
    const cachedTemplate = options.getCachedTemplate(options.id);
    if (cachedTemplate) return buildLoadResult(cachedTemplate);
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
  let sections: ChecklistTemplate['sections'];
  try { sections = preserveTemplateEditorExtensions(options.sourceSections ?? [], normalizedForm.sections); }
  catch (error) {
    if (!(error instanceof InvalidChecklistContentError)) throw error;
    return { success: false, errors: [{ type: 'content', message: error.message }] };
  }
  return dependencies.saveTemplate({
    id: options.id,
    title: normalizedForm.title,
    description: normalizedForm.description,
    sections,
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
  const { getTemplate } = useTemplates();
  const {
    saveTemplate: persistTemplateSave,
    isSaving,
  } = useTemplateSave();
  const loadedTemplateIdRef = useRef<string | null>(null);
  const sourceSectionsRef = useRef<ChecklistTemplate['sections']>([]);
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
        sourceSectionsRef.current = [];
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
      sourceSectionsRef.current = result.sourceSections ?? [];
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
        sourceSections: sourceSectionsRef.current,
      },
      {
        saveTemplate: dependencies?.saveTemplate ?? persistTemplateSave,
      },
    );

    if (result.success) {
      sourceSectionsRef.current = preserveTemplateEditorExtensions(sourceSectionsRef.current, values.sections);
      const savedState = buildTemplateEditorSavedState(values);
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
