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
  type TemplateEditorContentType,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";

interface ContentEditorProps {
  itemIndex: number;
  sectionIndex: number;
}

export function ContentEditor({
  itemIndex,
  sectionIndex,
}: ContentEditorProps): JSX.Element {
  const { control, setValue } = useFormContext<TemplateEditorFormValues>();
  const [showAddPanel, setShowAddPanel] = useState(false);
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
    setShowAddPanel(false);
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
    updates: Partial<TemplateEditorFormValues["sections"][number]["items"][number]["contents"][number]>,
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

  return (
    <div className="flex gap-6">
      <div className="flex-1 transition-all duration-200">
        <ContentAddPanel
          onAddContent={handleAddContent}
          onTogglePanel={() => setShowAddPanel((value) => !value)}
          showAddPanel={showAddPanel}
        />

        <div className="space-y-4">
          {contentsFieldArray.fields.map((contentField, contentIndex) => (
            <div
              className="relative rounded-xl border border-border/80 bg-muted/20 p-4"
              key={contentField.fieldId}
            >
              <Button
                className="absolute right-2 top-2 rounded-lg"
                onClick={() => contentsFieldArray.remove(contentIndex)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
              </Button>

              {renderContentEditor(contentIndex)}
            </div>
          ))}

          {!contents.length ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-8 text-center text-muted-foreground">
              <p>No content added yet.</p>
              <p className="text-sm">
                Use the "Add Content" button above to add text, images, videos,
                files, embeds, or sub-tasks.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
