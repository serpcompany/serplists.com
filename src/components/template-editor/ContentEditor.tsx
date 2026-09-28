import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Trash2 } from "lucide-react";

import { ContentAddPanel } from "@/components/template-editor/ContentAddPanel";
import { EmbedContentEditor } from "@/components/template-editor/content-types/EmbedContentEditor";
import { MediaContentEditor } from "@/components/template-editor/content-types/MediaContentEditor";
import { SubItemsEditor } from "@/components/template-editor/content-types/SubItemsEditor";
import { TextContentEditor } from "@/components/template-editor/content-types/TextContentEditor";
import { Button } from "@/components/ui/button";
import {
  createTemplateEditorContent,
  type TemplateEditorContent,
  type TemplateEditorContentType,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";

type ActiveAddPanel = "empty" | "header" | null;

interface ContentEditorProps {
  itemIndex: number;
  sectionIndex: number;
}

export function ContentEditor({
  itemIndex,
  sectionIndex,
}: ContentEditorProps): JSX.Element {
  const { control, setValue } = useFormContext<TemplateEditorFormValues>();
  const [activeAddPanel, setActiveAddPanel] = useState<ActiveAddPanel>(null);
  const contentsFieldArray = useFieldArray({
    control,
    keyName: "fieldId",
    name: `sections.${sectionIndex}.items.${itemIndex}.contents` as const,
  });
  const contents =
    useWatch({
      control,
      name: `sections.${sectionIndex}.items.${itemIndex}.contents` as const,
    }) ?? [];

  function handleAddContent(type: TemplateEditorContentType): void {
    contentsFieldArray.append(createTemplateEditorContent(type));
    setActiveAddPanel(null);
  }

  function toggleAddPanel(panel: Exclude<ActiveAddPanel, null>): void {
    setActiveAddPanel((currentPanel) =>
      currentPanel === panel ? null : panel,
    );
  }

  function handleContentValueChange(contentIndex: number, value: string): void {
    setValue(
      `sections.${sectionIndex}.items.${itemIndex}.contents.${contentIndex}.value`,
      value,
      { shouldDirty: true },
    );
  }

  function handleContentMetaChange(
    contentIndex: number,
    updates: Partial<TemplateEditorContent>,
  ): void {
    const currentContent = contents[contentIndex];
    if (!currentContent) {
      return;
    }

    setValue(
      `sections.${sectionIndex}.items.${itemIndex}.contents.${contentIndex}`,
      {
        ...currentContent,
        ...updates,
      },
      { shouldDirty: true },
    );
  }

  function renderContentEditor(contentIndex: number): JSX.Element | null {
    const content = contents[contentIndex];
    if (!content) {
      return null;
    }

    switch (content.type) {
      case "text":
        return (
          <TextContentEditor
            onChange={(value) => handleContentValueChange(contentIndex, value)}
            value={content.value}
          />
        );
      case "image":
      case "video":
      case "file":
        return (
          <MediaContentEditor
            fileName={content.fileName}
            onFileInfoChange={(fileName, fileSize) =>
              handleContentMetaChange(contentIndex, { fileName, fileSize })
            }
            onValueChange={(value) => handleContentValueChange(contentIndex, value)}
            type={content.type}
            value={content.value}
          />
        );
      case "embed":
        return (
          <EmbedContentEditor
            onValueChange={(value) => handleContentValueChange(contentIndex, value)}
            value={content.value}
          />
        );
      case "subItems":
        return (
          <SubItemsEditor
            contentIndex={contentIndex}
            itemIndex={itemIndex}
            sectionIndex={sectionIndex}
          />
        );
      default:
        return null;
    }
  }

  const contentTypeLabels: Record<
    NonNullable<(typeof contents)[number]>["type"],
    string
  > = {
    text: "Text",
    image: "Image",
    video: "Video",
    file: "File",
    embed: "Embed",
    subItems: "Sub-tasks",
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-6 flex items-center justify-between border-b border-border bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <h3 className="text-sm font-medium text-foreground">Content Blocks</h3>
        <ContentAddPanel
          onAddContent={handleAddContent}
          onTogglePanel={() => toggleAddPanel("header")}
          showAddPanel={activeAddPanel === "header"}
        />
      </div>

      {contentsFieldArray.fields.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8">
          <p className="mb-3 text-sm text-muted-foreground">No content blocks yet</p>
          <ContentAddPanel
            onAddContent={handleAddContent}
            onTogglePanel={() => toggleAddPanel("empty")}
            showAddPanel={activeAddPanel === "empty"}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {contentsFieldArray.fields.map((contentField, contentIndex) => (
            <div
              className="group rounded-lg border border-border bg-card"
              key={contentField.fieldId}
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <div className="h-4 w-4 shrink-0 cursor-grab rounded bg-muted/50" />
                <span className="flex-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {contentTypeLabels[contents[contentIndex]?.type ?? "text"]}
                </span>
                <Button
                  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  onClick={() => contentsFieldArray.remove(contentIndex)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="p-3">{renderContentEditor(contentIndex)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
