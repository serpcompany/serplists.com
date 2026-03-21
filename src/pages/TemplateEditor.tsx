import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTemplates } from "@/contexts/TemplatesContext";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, Plus } from "lucide-react";
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

const TemplateEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getTemplate } = useTemplates();
  const { user } = useAuth();
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
          <Button variant="outline" onClick={() => navigate("/templates")}>
            Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  const selectedSection = sections[selectedSectionIndex];
  const selectedItem = selectedItemIndex !== null && selectedSection?.items[selectedItemIndex];

  return (
    <div className="min-h-screen bg-background">
      <TemplateHeader
        isEditing={!!id}
        isSaving={isSaving}
        templateSlug={templateSlug}
        onCancel={() => navigate("/templates")}
        onSave={handleSave}
      />

      {/* Error Alert */}
      {errors.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 py-4">
          <Alert variant="destructive">
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

      {/* Three Column Layout with Fixed Heights */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Sidebar - Template Info, SEO & Tasks */}
          <div className="lg:col-span-1 space-y-4">
            {/* Template Basic Info Section */}
            <Card 
              className={`cursor-pointer transition-colors ${showingTemplateInfo ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
              onClick={handleSelectTemplateInfo}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Template Info</h3>
                    <p className="text-sm text-muted-foreground">
                      {title || description || categories.length > 0 || tags.length > 0
                        ? 'Configured' 
                        : 'Click to configure'
                      }
                    </p>
                  </div>
                  <div className="text-muted-foreground">
                    {title || description || categories.length > 0 || tags.length > 0 ? '✓' : '→'}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SEO Meta Section */}
            <Card 
              className={`cursor-pointer transition-colors ${showingSEO ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
              onClick={handleSelectSEO}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">SEO & Meta</h3>
                    <p className="text-sm text-muted-foreground">
                      {seoTitle || seoDescription || seoUrl 
                        ? 'Configured' 
                        : 'Click to configure'
                      }
                    </p>
                  </div>
                  <div className="text-muted-foreground">
                    {seoTitle || seoDescription || seoUrl ? '✓' : '→'}
                  </div>
                </div>
              </CardContent>
            </Card>

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

          {/* Right Content - SEO/Section/Item Editor */}
          <div className="lg:col-span-2">
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
                ) : null}
              </div>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2">No tasks yet</h3>
                    <p className="text-muted-foreground mb-4">Create your first task to get started</p>
                    <Button onClick={addSection}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Task
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditor;
