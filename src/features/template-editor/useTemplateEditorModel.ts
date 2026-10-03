import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { mapApiTemplateToChecklistTemplate } from "@/features/template-detail/templateDetailMappers";
import { cloneTemplateEditorFormValues } from "@/features/template-editor/postSaveFormState";
import type { LoadedTemplateOwnership } from "@/features/template-editor/templateEditPermission";
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
import { findTemplateEditorSlugIssue } from "@/lib/forms/templateEditorDetailsForm";
import { api } from "@/lib/api";
import { resolvePublicTemplateOwnerSlug } from "@/lib/routes";
import type { ChecklistTemplate } from "@/types/checklist";

type TemplateEditorApiClient = Pick<typeof api, "getTemplateById">;

type TemplateEditorModelDependencies = {
  apiClient?: TemplateEditorApiClient | undefined;
  saveTemplate?: (input: SaveTemplateInput) => Promise<SaveTemplateResult>;
};

type TemplateEditorModelOptions = {
  id?: string | undefined;
};

type LoadTemplateEditorDataOptions = {
  id?: string;
};

type SaveTemplateEditorDataOptions = {
  id?: string | undefined;
  expectedVersion?: number | undefined;
  storedSlug?: string | undefined;
  values: TemplateEditorFormValues;
  loadedIsPublic?: boolean | undefined;
};

type SaveTemplateEditorDependencies = {
  saveTemplate: (input: SaveTemplateInput) => Promise<SaveTemplateResult>;
};

export type TemplateEditorSaveResult = SaveTemplateResult & {
  savedValues?: TemplateEditorFormValues;
  stale?: boolean;
};

export type TemplateEditorLoadResult = {
  initialValues: TemplateEditorFormValues;
  loadError: string | null;
  templateSlug?: string | undefined;
  version?: number | undefined;
  ownerSlug?: string | null | undefined;
  ownership?: LoadedTemplateOwnership | undefined;
};

const buildDefaultTemplateEditorTemplate =
  (): Partial<ChecklistTemplate> => ({});

export const buildTemplateEditorSavedState = (
  values: TemplateEditorFormValues,
  slugs: { storedSlug?: string | undefined; savedSlug?: string | undefined } = {},
  stored?: SaveTemplateResult["saved"],
): TemplateEditorLoadResult => {
  const normalizedForm = normalizeTemplateEditorFormForSave(values, slugs);
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
  id?: string | undefined;
  result: SaveTemplateResult;
}): boolean => params.result.success && !params.id;

export const shouldLockTemplateEditorWhileSaving = (params: {
  id?: string | undefined;
  isSaving: boolean;
}): boolean => params.isSaving && !params.id;

export const getTemplateSaveSuccessMessage = (params: {
  id?: string | undefined;
  result: SaveTemplateResult;
}): string | null => {
  if (!params.result.success) {
    return null;
  }
  return params.id ? "Template saved" : "Template created";
};

export const shouldApplyTemplateEditorSaveResult = (params: {
  requestedId?: string | undefined;
  currentId?: string | undefined;
  mounted: boolean;
}): boolean => params.mounted && params.requestedId === params.currentId;

export type TemplateSaveFeedback = {
  successMessage: string | null;
  errorMessage: string | null;
  navigateToTemplates: boolean;
  inlineErrors: SaveTemplateResult["errors"] | null;
};

export const resolveTemplateSaveFeedback = (params: {
  id?: string | undefined;
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
  ownership: template?.id
    ? { userId: template.userId ?? "", teamId: template.teamId, ownerType: template.ownerType, isPublic: template.isPublic ?? false }
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

export const loadTemplateEditorData = async (
  options: LoadTemplateEditorDataOptions,
  dependencies?: Pick<TemplateEditorModelDependencies, "apiClient">,
): Promise<TemplateEditorLoadResult> => {
  if (!options.id) {
    return buildLoadResult(buildDefaultTemplateEditorTemplate());
  }

  try {
    const fetchedTemplate = await getApiClient(dependencies).getTemplateById(options.id);
    const template = mapApiTemplateToChecklistTemplate(fetchedTemplate, options.id);
    const storedSections = Array.isArray(fetchedTemplate.sections)
      ? fetchedTemplate.sections
      : template.sections;

    return buildLoadResult(template, storedSections);
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
  const slugIssue = findTemplateEditorSlugIssue(options.values.seoUrl, options.storedSlug);
  const validationErrors = [
    ...validateTemplateEditorFormForSave(normalizedForm),
    ...(slugIssue ? [{ type: "validation" as const, message: slugIssue }] : []),
  ];
  if (validationErrors.length > 0) {
    return { success: false, errors: validationErrors };
  }
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
  const expectedVersionRef = useRef<number | undefined>(undefined);
  const currentIdRef = useRef(options.id);
  const mountedRef = useRef(true);
  const loadedIsPublicRef = useRef<boolean | undefined>(undefined);
  const apiClientRef = useRef<TemplateEditorApiClient | undefined>(
    dependencies?.apiClient,
  );
  const [reloadCount, setReloadCount] = useState(0);
  const [initialValues, setInitialValues] = useState<TemplateEditorFormValues>(
    () => buildTemplateEditorFormValues(buildDefaultTemplateEditorTemplate()),
  );
  const [loading, setLoading] = useState(() => Boolean(options.id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateSlug, setTemplateSlug] = useState<string | undefined>();
  const [ownerSlug, setOwnerSlug] = useState<string | null | undefined>();
  const [ownership, setOwnership] = useState<LoadedTemplateOwnership | undefined>();

  useLayoutEffect(() => {
    apiClientRef.current = dependencies?.apiClient;
    currentIdRef.current = options.id;
  });

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
        setOwnership(undefined);
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
      setOwnership(result.ownership);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [options.id, reloadCount]);

  const getVersion = () => expectedVersionRef.current;
  const setVersion = (version: number | undefined) => {
    expectedVersionRef.current = version;
  };

  const reload = () => {
    loadedTemplateIdRef.current = null;
    setReloadCount((count) => count + 1);
  };

  const save = async (
    values: TemplateEditorFormValues,
  ): Promise<TemplateEditorSaveResult> => {
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
    getVersion,
    initialValues,
    loading,
    loadError,
    reload,
    save,
    setVersion,
    isSaving,
    ownerSlug,
    ownership,
    templateSlug,
  };
};
