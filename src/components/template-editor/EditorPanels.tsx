import { useFormContext, useWatch } from "react-hook-form";

import { ItemEditor } from "@/components/template-editor/ItemEditor";
import { SEOMetaEditor } from "@/components/template-editor/SEOMetaEditor";
import { SectionEditor } from "@/components/template-editor/SectionEditor";
import { TemplateBasicInfo } from "@/components/template-editor/TemplateBasicInfo";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

interface EditorPanelsProps {
  // The template owner's public profile slug, for the Search & SEO preview URL.
  publicOwnerSlug: string | null;
  selectedSectionIndex: number;
  selectedItemIndex: number | null;
  showingSEO: boolean;
  showingTemplateInfo: boolean;
}

function getPanelTitle(
  params: Pick<
    EditorPanelsProps,
    "showingSEO" | "showingTemplateInfo" | "selectedItemIndex"
  >,
): string {
  if (params.showingTemplateInfo) {
    return "Template Settings";
  }

  if (params.showingSEO) {
    return "Search & SEO";
  }

  if (params.selectedItemIndex !== null) {
    return "Task Details";
  }

  return "Section Settings";
}

function getPanelDescription(
  params: Pick<
    EditorPanelsProps,
    "showingSEO" | "showingTemplateInfo" | "selectedItemIndex"
  >,
): string {
  if (params.showingTemplateInfo) {
    return "Define what this template is and how it should be organized.";
  }

  if (params.showingSEO) {
    return "Configure how this template appears in search results and public listings.";
  }

  if (params.selectedItemIndex !== null) {
    return "Write the task like a docs step. The title should be scannable and the body should explain the exact action to take.";
  }

  return "Keep section names short enough that the outline reads like a clean table of contents.";
}

export function EditorPanels({
  publicOwnerSlug,
  selectedSectionIndex,
  selectedItemIndex,
  showingSEO,
  showingTemplateInfo,
}: EditorPanelsProps): JSX.Element {
  const { control } = useFormContext<TemplateEditorFormValues>();
  const sections = useWatch({
    control,
    name: "sections",
  });
  const selectedSection = sections?.[selectedSectionIndex];
  const selectedItem =
    selectedItemIndex !== null ? selectedSection?.items[selectedItemIndex] : null;

  const panelTitle = getPanelTitle({
    selectedItemIndex,
    showingSEO,
    showingTemplateInfo,
  });
  const panelDescription = getPanelDescription({
    selectedItemIndex,
    showingSEO,
    showingTemplateInfo,
  });

  return (
    <ScrollArea className="flex-1 bg-background">
      <div className="mx-auto max-w-2xl p-8">
        <div className="space-y-8">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{panelTitle}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {panelDescription}
            </p>
          </div>

          {showingTemplateInfo ? (
            <TemplateBasicInfo showIntro={false} />
          ) : showingSEO ? (
            <SEOMetaEditor ownerSlug={publicOwnerSlug} showIntro={false} />
          ) : selectedSection ? (
            <div className="space-y-6">
              {selectedItemIndex === null ? (
                <SectionEditor sectionIndex={selectedSectionIndex} showIntro={false} />
              ) : selectedItem ? (
                <ItemEditor
                  itemIndex={selectedItemIndex}
                  key={`${selectedSection.id}:${selectedItem.id}`}
                  sectionIndex={selectedSectionIndex}
                  showIntro={false}
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
    </ScrollArea>
  );
}
