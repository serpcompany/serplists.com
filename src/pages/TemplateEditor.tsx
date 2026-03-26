import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTemplates } from "@/contexts/TemplatesContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, FilePenLine, Loader2, SearchCheck } from "lucide-react";
import { useTemplateEditorState } from "@/hooks/useTemplateEditorState";
import { useTemplateSave } from "@/hooks/useTemplateSave";
import { TemplateHeader } from "@/components/template-editor/TemplateHeader";
import { TemplateBasicInfo } from "@/components/template-editor/TemplateBasicInfo";
import { SEOMetaEditor } from "@/components/template-editor/SEOMetaEditor";
import { SectionSidebar } from "@/components/template-editor/SectionSidebar";
import { SectionEditor } from "@/components/template-editor/SectionEditor";
import { ItemEditor } from "@/components/template-editor/ItemEditor";
import { PageContainer } from "@/components/layout/page-shell";
import { api } from "@/lib/api";
import { buildConsoleTemplatesPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  buildTemplateEditorFormValues,
  normalizeTemplateEditorFormForSave,
  templateEditorFormSchema,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
import { Form } from "@/components/ui/form";

const TemplateEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getTemplate } = useTemplates();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateSlug, setTemplateSlug] = useState<string | undefined>();
  
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
    defaultValues: buildTemplateEditorFormValues(),
  });
  const formValues = templateForm.watch();
  const sections = formValues.sections;

  const { saveTemplate, isSaving } = useTemplateSave();

  // Load template data if editing
  useEffect(() => {
    let cancelled = false;

    const applyTemplate = (template: {
      title: string;
      description?: string;
      seoTitle?: string;
      seoDescription?: string;
      seoUrl?: string;
      categories?: string[];
      tags?: string[];
      type?: "checklist" | "recipe";
      isPublic: boolean;
      slug?: string;
      sections: unknown[];
    }) => {
      templateForm.reset(
        buildTemplateEditorFormValues({
          categories: template.categories,
          description: template.description,
          isPublic: template.isPublic,
          sections: template.sections as TemplateEditorFormValues["sections"],
          seoDescription: template.seoDescription,
          seoTitle: template.seoTitle,
          seoUrl: template.seoUrl,
          slug: template.slug,
          tags: template.tags,
          title: template.title,
          type: template.type,
        }),
      );
      setTemplateSlug(template.slug);
    };

    const load = async () => {
      setLoadError(null);

      if (!id) {
        templateForm.reset(buildTemplateEditorFormValues());
        setIsLoading(false);
        return;
      }

      const cached = getTemplate(id);
      if (cached) {
        applyTemplate(cached);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const fetched = (await api.getTemplateById(id)) as Record<string, unknown>;
        if (cancelled) return;

        const categories = Array.isArray(fetched.categories)
          ? (fetched.categories as string[])
          : (typeof fetched.category === 'string' && fetched.category ? [fetched.category] : []);

        applyTemplate({
          title: typeof fetched.title === 'string' ? fetched.title : "",
          description: typeof fetched.description === 'string' ? fetched.description : "",
          seoTitle: typeof fetched.seoTitle === 'string' ? fetched.seoTitle : "",
          seoDescription: typeof fetched.seoDescription === 'string' ? fetched.seoDescription : "",
          seoUrl: typeof fetched.slug === 'string' ? fetched.slug : "",
          categories,
          tags: Array.isArray(fetched.tags) ? (fetched.tags as string[]) : [],
          type: fetched.type === "recipe" ? "recipe" : "checklist",
          isPublic: Boolean((fetched as { is_public?: unknown }).is_public),
          slug: typeof fetched.slug === 'string' ? fetched.slug : "",
      sections: Array.isArray(fetched.sections) ? fetched.sections : [],
        });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load template";
        setLoadError(message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [templateForm, id, getTemplate]);

  const handleSave = async () => {
    const isValid = await templateForm.trigger();
    if (!isValid) {
      return;
    }

    const normalizedForm = normalizeTemplateEditorFormForSave(
      templateForm.getValues(),
    );
    const result = await saveTemplate(
      id,
      normalizedForm.title,
      normalizedForm.description,
      normalizedForm.sections,
      normalizedForm.seoTitle,
      normalizedForm.seoDescription,
      normalizedForm.seoUrl,
      normalizedForm.templateType,
      normalizedForm.categories,
      normalizedForm.tags,
      normalizedForm.isPublic
    );
    if (result.success) {
      setTemplateSlug(normalizedForm.seoUrl || templateSlug);
    }
    setErrors(result.errors);
  };

  if (isLoading) {
    return (
      <div className="flex h-52 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to load template</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate(buildConsoleTemplatesPath())}>
            Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  const selectedSection = sections[selectedSectionIndex];
  const selectedItem = selectedItemIndex !== null && selectedSection?.items[selectedItemIndex];
  const sectionLabel =
    selectedSection?.title || `Section ${selectedSectionIndex + 1}`;
  const editorHeading = showingTemplateInfo
    ? "Template form"
    : showingSEO
      ? "Search preview"
      : selectedItem
        ? selectedItem.title || `Task ${selectedItemIndex + 1}`
        : sectionLabel;
  const editorDescription = showingTemplateInfo
    ? "Name the SOP, define the outcome, and set access plus organization fields before detailing the steps."
    : showingSEO
      ? "Keep the public title, slug, and description tight so the template reads cleanly outside the editor."
      : selectedItem
        ? "Write the instructions, supporting content, and subtasks for the selected item."
        : "Keep section names concise so the left rail stays easy to scan.";

  return (
    <div className="min-h-screen bg-background">
      <TemplateHeader
        isEditing={!!id}
        isSaving={isSaving}
        templateSlug={templateSlug}
        onCancel={() => navigate(buildConsoleTemplatesPath())}
        onSave={handleSave}
      />

      {/* Error Alert */}
      {errors.length > 0 && (
        <PageContainer className="py-4" width="shell">
          <Alert variant="destructive" className="docs-panel border-destructive/30 shadow-none">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              <ul className="list-inside list-disc">
                {errors.map((error, index: number) => (
                  <li key={index}>{error.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </PageContainer>
      )}

      <Form {...templateForm}>
      <PageContainer className="py-4" width="shell">
        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="docs-panel overflow-hidden">
              {[
                {
                  active: showingTemplateInfo,
                  configured:
                    Boolean(formValues.title) ||
                    Boolean(formValues.description) ||
                    formValues.categories.length > 0 ||
                    formValues.tags.length > 0,
                  icon: FilePenLine,
                  label: "Template form",
                  detail: "Identity, access, and organization",
                  onClick: handleSelectTemplateInfo,
                },
                {
                  active: showingSEO,
                  configured:
                    Boolean(formValues.seoTitle) ||
                    Boolean(formValues.seoDescription) ||
                    Boolean(formValues.seoUrl),
                  icon: SearchCheck,
                  label: "Search preview",
                  detail: "Slug, title, and description",
                  onClick: handleSelectSEO,
                },
              ].map((entry, index) => {
                const Icon = entry.icon;

                return (
                  <button
                    key={entry.label}
                    type="button"
                    onClick={entry.onClick}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3.5 text-left transition",
                      index > 0 && "border-t border-border/70",
                      entry.active ? "bg-muted/45" : "hover:bg-muted/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 rounded-md border border-border/70 p-2",
                        entry.active ? "bg-background text-primary" : "bg-card text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">
                          {entry.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.configured ? "Ready" : "Setup"}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {entry.detail}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <SectionSidebar
              selectedSectionIndex={selectedSectionIndex}
              selectedItemIndex={selectedItemIndex}
              onSelectSection={handleSelectSection}
              onSelectItem={handleSelectItem}
            />
          </div>

          <div className="docs-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                Editing panel
              </p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">
                {editorHeading}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                {editorDescription}
              </p>
              </div>
              {!showingTemplateInfo && !showingSEO ? (
                <div className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  {selectedItem ? "Task details" : "Section details"}
                </div>
              ) : null}
            </div>

            <div className="px-5 py-5">
              {showingTemplateInfo ? (
                <TemplateBasicInfo />
              ) : showingSEO ? (
                <SEOMetaEditor />
              ) : selectedSection ? (
                <div className="space-y-6">
                  {selectedItemIndex === null ? (
                    <SectionEditor sectionIndex={selectedSectionIndex} />
                  ) : selectedItem ? (
                    <ItemEditor
                      itemIndex={selectedItemIndex}
                      sectionIndex={selectedSectionIndex}
                    />
                  ) : (
                    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 px-6 text-center">
                      <p className="max-w-md text-sm leading-6 text-muted-foreground">
                        Select a task from the outline to edit its instructions and attached content.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 px-6 text-center">
                  <p className="max-w-md text-sm leading-6 text-muted-foreground">
                    Add a section from the outline to start building this template.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </PageContainer>
      </Form>
    </div>
  );
};

export default TemplateEditor;
