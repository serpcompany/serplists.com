import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTemplates } from "@/contexts/TemplatesContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, FilePenLine, Loader2, SearchCheck } from "lucide-react";
import { useTemplateEditor } from "@/hooks/useTemplateEditor";
import { useTemplateEditorState } from "@/hooks/useTemplateEditorState";
import { useTemplateSave } from "@/hooks/useTemplateSave";
import { TemplateHeader } from "@/components/template-editor/TemplateHeader";
import { TemplateBasicInfo } from "@/components/template-editor/TemplateBasicInfo";
import { SEOMetaEditor } from "@/components/template-editor/SEOMetaEditor";
import { SectionSidebar } from "@/components/template-editor/SectionSidebar";
import { SectionEditor } from "@/components/template-editor/SectionEditor";
import { ItemEditor } from "@/components/template-editor/ItemEditor";
import { api } from "@/lib/api";
import { buildConsoleTemplatesPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

const TemplateEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getTemplate } = useTemplates();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [templateSlug, setTemplateSlug] = useState<string | undefined>();
  
  const {
    title,
    setTitle,
    description,
    setDescription,
    seoTitle,
    setSeoTitle,
    seoDescription,
    setSeoDescription,
    seoUrl,
    setSeoUrl,
    templateType,
    setTemplateType,
    categories,
    setCategories,
    tags,
    setTags,
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

  const {
    sections,
    setSections,
    addSection,
    updateSection,
    removeSection,
    addItem,
    updateItem,
    removeItem,
    addItemContent,
    updateItemContent,
    updateItemContentMeta,
    removeItemContent,
    addSubItem,
    updateSubItem,
    removeSubItem
  } = useTemplateEditor();

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
      setTitle(template.title);
      setDescription(template.description || "");
      setSeoTitle(template.seoTitle || "");
      setSeoDescription(template.seoDescription || "");
      setSeoUrl(template.seoUrl || template.slug || "");
      setTemplateType(template.type || "checklist");
      setCategories(template.categories || []);
      setTags(template.tags || []);
      setIsPublic(template.isPublic);
      setTemplateSlug(template.slug);
      setSections(JSON.parse(JSON.stringify(template.sections)));
    };

    const load = async () => {
      setLoadError(null);

      if (!id) {
        // New template - initialize with one empty section
        setSections([
          {
            id: `section_${Date.now()}`,
            title: "",
            items: [],
          },
        ]);
        setIsPublic(true);
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
  }, [id, getTemplate, setSections, setTitle, setDescription, setSeoTitle, setSeoDescription, setSeoUrl, setTemplateType, setCategories, setTags]);

  const handleSave = async () => {
    const result = await saveTemplate(
      id,
      title,
      description,
      sections,
      seoTitle,
      seoDescription,
      seoUrl,
      templateType,
      categories,
      tags,
      isPublic
    );
    if (result.success) {
      setTemplateSlug(seoUrl || templateSlug);
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
    ? "Template input"
    : showingSEO
      ? "Search presentation"
      : selectedItem
        ? selectedItem.title || `Task ${selectedItemIndex + 1}`
        : sectionLabel;
  const editorDescription = showingTemplateInfo
    ? "Set the title, visibility, categories, and structure before you start filling in detailed task content."
    : showingSEO
      ? "Keep the SEO fields concise so the public version reads more like a clear docs page than a landing page."
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
        <div className="mx-auto max-w-7xl px-4 py-4">
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
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="docs-panel overflow-hidden">
              {[
                {
                  active: showingTemplateInfo,
                  configured:
                    Boolean(title) ||
                    Boolean(description) ||
                    categories.length > 0 ||
                    tags.length > 0,
                  icon: FilePenLine,
                  label: "Template info",
                  detail: "Title, tags, visibility, and type",
                  onClick: handleSelectTemplateInfo,
                },
                {
                  active: showingSEO,
                  configured:
                    Boolean(seoTitle) ||
                    Boolean(seoDescription) ||
                    Boolean(seoUrl),
                  icon: SearchCheck,
                  label: "SEO & sharing",
                  detail: "Slug, preview title, and meta description",
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
                      "flex w-full items-start gap-3 px-4 py-4 text-left transition",
                      index > 0 && "border-t border-border/70",
                      entry.active ? "bg-muted/45" : "hover:bg-muted/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 rounded-lg border border-border/70 p-2",
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
              sections={sections}
              selectedSectionIndex={selectedSectionIndex}
              selectedItemIndex={selectedItemIndex}
              onSelectSection={handleSelectSection}
              onSelectItem={handleSelectItem}
              onAddSection={addSection}
              onRemoveSection={removeSection}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onUpdateSection={updateSection}
              onUpdateItem={updateItem}
            />
          </div>

          <div className="docs-panel overflow-hidden">
            <div className="border-b border-border/70 bg-muted/30 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                Input workspace
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                {editorHeading}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {editorDescription}
              </p>
            </div>

            <div className="px-6 py-6">
              {showingTemplateInfo ? (
                <TemplateBasicInfo
                  title={title}
                  description={description}
                  templateType={templateType}
                  categories={categories}
                  tags={tags}
                  isPublic={isPublic}
                  onTitleChange={setTitle}
                  onDescriptionChange={setDescription}
                  onTemplateTypeChange={setTemplateType}
                  onCategoriesChange={setCategories}
                  onTagsChange={setTags}
                  onPublicChange={setIsPublic}
                  errors={errors}
                />
              ) : showingSEO ? (
                <SEOMetaEditor
                  seoTitle={seoTitle}
                  seoDescription={seoDescription}
                  seoUrl={seoUrl}
                  onSeoTitleChange={setSeoTitle}
                  onSeoDescriptionChange={setSeoDescription}
                  onSeoUrlChange={setSeoUrl}
                />
              ) : selectedSection ? (
                <div className="space-y-6">
                  {selectedItemIndex === null ? (
                    <SectionEditor
                      section={selectedSection}
                      sectionIndex={selectedSectionIndex}
                      onUpdateSection={updateSection}
                      errors={errors}
                    />
                  ) : selectedItem ? (
                    <ItemEditor
                      item={selectedItem}
                      sectionIndex={selectedSectionIndex}
                      itemIndex={selectedItemIndex}
                      onUpdateItem={updateItem}
                      onAddItemContent={addItemContent}
                      onUpdateItemContent={updateItemContent}
                      onUpdateItemContentMeta={updateItemContentMeta}
                      onRemoveItemContent={removeItemContent}
                      onAddSubItem={addSubItem}
                      onUpdateSubItem={updateSubItem}
                      onRemoveSubItem={removeSubItem}
                      errors={errors}
                    />
                  ) : (
                    <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 text-center">
                      <p className="max-w-md text-sm leading-6 text-muted-foreground">
                        Select a task from the outline to edit its instructions and attached content.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 text-center">
                  <p className="max-w-md text-sm leading-6 text-muted-foreground">
                    Add a section from the outline to start building this template.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditor;
