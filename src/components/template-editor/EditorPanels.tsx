import type { JSX } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { EDITOR_PANEL_HEADING_ID, EDITOR_PANEL_ID } from "@/components/template-editor/editorPanelIds";
import { ItemEditor } from "@/components/template-editor/ItemEditor";
import { SEOMetaEditor } from "@/components/template-editor/SEOMetaEditor";
import { SectionEditor } from "@/components/template-editor/SectionEditor";
import { TemplateBasicInfo } from "@/components/template-editor/TemplateBasicInfo";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

interface EditorPanelsProps {
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
    <section
      aria-labelledby={EDITOR_PANEL_HEADING_ID}
      className="flex min-w-0 flex-col gap-6 scroll-mt-32"
      id={EDITOR_PANEL_ID}
    >
      <div className="flex flex-col gap-1">
        <h2
          className="text-lg font-semibold tracking-tight"
          id={EDITOR_PANEL_HEADING_ID}
          tabIndex={-1}
        >
          {panelTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{panelDescription}</p>
      </div>

      {showingTemplateInfo ? (
        <TemplateBasicInfo showIntro={false} />
      ) : showingSEO ? (
        <SEOMetaEditor ownerSlug={publicOwnerSlug} showIntro={false} />
      ) : selectedSection ? (
        selectedItemIndex === null ? (
          <SectionEditor sectionIndex={selectedSectionIndex} showIntro={false} />
        ) : selectedItem ? (
          <ItemEditor
            itemIndex={selectedItemIndex}
            key={`${selectedSection.id}:${selectedItem.id}`}
            sectionIndex={selectedSectionIndex}
            showIntro={false}
          />
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyDescription>
                Select a task from the outline to edit its instructions and attached content.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>
              Add a section from the outline to start building this template.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
