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
import {
  buildV0DemoPrivateTemplate,
  isV0DemoPrivateTemplateId,
} from "@/features/parity/v0DemoFixtures";

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
};

type SaveTemplateEditorDependencies = {
  saveTemplate: (input: SaveTemplateInput) => Promise<SaveTemplateResult>;
};

export type TemplateEditorLoadResult = {
  initialValues: TemplateEditorFormValues;
  loadError: string | null;
  templateSlug?: string;
};

export const buildDefaultTemplateEditorTemplate = (): Partial<ChecklistTemplate> => ({
  id: "tpl-new-001",
  title: "New Employee Onboarding",
  description: "A comprehensive checklist for onboarding new team members",
  type: "checklist",
  slug: "new-employee-onboarding",
  seoTitle: "New Employee Onboarding",
  seoDescription: "A comprehensive checklist for onboarding new team members",
  categories: ["HR", "Onboarding"],
  tags: ["new-hire", "checklist", "employee"],
  isPublic: false,
  sections: [
    {
      id: "sec-001",
      title: "Before Day One",
      items: [
        {
          id: "task-001",
          title: "Send welcome email with first-day instructions",
          description:
            "Include parking info, dress code, and arrival time",
          contents: [
            {
              id: "content-001",
              type: "text",
              value:
                "Make sure to include:\n- Office address and parking instructions\n- What to bring (ID, documents)\n- Who to ask for at reception",
            },
          ],
        },
        {
          id: "task-002",
          title: "Set up workstation and equipment",
          contents: [
            {
              id: "content-002",
              type: "subItems",
              value: "",
              subItems: [
                { id: "sub-001", title: "Order laptop and accessories" },
                { id: "sub-002", title: "Set up desk and chair" },
                { id: "sub-003", title: "Prepare welcome kit" },
              ],
            },
          ],
        },
        {
          id: "task-003",
          title: "Create accounts and access",
          contents: [],
        },
      ],
    },
    {
      id: "sec-002",
      title: "First Day",
      items: [
        {
          id: "task-004",
          title: "Welcome and office tour",
          description: "Show key areas and introduce to team",
          contents: [
            {
              id: "content-003",
              type: "video",
              value: "https://www.youtube.com/watch?v=PL4ktpwAxBE",
            },
          ],
        },
        {
          id: "task-005",
          title: "IT setup and system access",
          contents: [
            {
              id: "content-004",
              type: "text",
              value:
                "Walk through email setup, VPN configuration, and access to essential tools.",
            },
          ],
        },
      ],
    },
    {
      id: "sec-003",
      title: "First Week",
      items: [
        {
          id: "task-006",
          title: "Complete HR paperwork",
          contents: [],
        },
        {
          id: "task-007",
          title: "Team introductions and shadowing",
          contents: [],
        },
        {
          id: "task-008",
          title: "Review company policies and handbook",
          contents: [
            {
              id: "content-005",
              type: "embed",
              value: "https://company.notion.site/employee-handbook",
            },
          ],
        },
      ],
    },
  ],
});

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
): TemplateEditorLoadResult => ({
  initialValues: buildTemplateEditorFormValues(template),
  loadError: null,
  templateSlug: template?.slug ?? template?.seoUrl,
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

  if (isV0DemoPrivateTemplateId(options.id)) {
    return buildLoadResult(buildV0DemoPrivateTemplate());
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
  if (isV0DemoPrivateTemplateId(options.id)) {
    return { success: true, errors: [] };
  }

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
      },
      {
        saveTemplate: dependencies?.saveTemplate ?? persistTemplateSave,
      },
    );

    if (result.success) {
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
