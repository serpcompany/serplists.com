import type { JSX } from "react";
import { useId, useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Trash2 } from "lucide-react";

import { ContentAddPanel } from "@/components/template-editor/ContentAddPanel";
import { ReorderHandle, ReorderHint, ReorderMoveButtons } from "@/components/template-editor/ReorderHandle";
import { dropIndicatorClass, ROW_ACTIONS_REVEAL_CLASS } from "@/components/template-editor/reorder";
import { useBlockDrag } from "@/components/template-editor/useBlockDrag";
import { EmbedContentEditor } from "@/components/template-editor/content-types/EmbedContentEditor";
import { FormFieldsEditor } from "@/components/template-editor/content-types/FormFieldsEditor";
import { MediaContentEditor } from "@/components/template-editor/content-types/MediaContentEditor";
import { SubItemsEditor } from "@/components/template-editor/content-types/SubItemsEditor";
import { TextContentEditor } from "@/components/template-editor/content-types/TextContentEditor";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import type { FileUploadChange } from "@/components/ui/file-upload";
import { useTrackTemplateEditorUpload } from "@/features/template-editor/pendingUploads";
import {
  createTemplateEditorContent,
  findTemplateEditorContentPath,
  type TemplateEditorContentType,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
import { cn } from "@/lib/utils";
import { withMediaValue } from "@/lib/utils/mediaSource";

interface ContentEditorProps {
  itemIndex: number;
  sectionIndex: number;
}

export function ContentEditor({
  itemIndex,
  sectionIndex,
}: ContentEditorProps): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TemplateEditorFormValues>();
  const trackUpload = useTrackTemplateEditorUpload();
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
  const blockDrag = useBlockDrag(contentsFieldArray.move);
  const [moveAnnouncement, setMoveAnnouncement] = useState("");
  const reorderHintId = useId();

  function handleAddContent(type: TemplateEditorContentType): void {
    contentsFieldArray.append(createTemplateEditorContent(type));
  }

  function handleContentValueChange(contentIndex: number, value: string): void {
    setValue(
      `sections.${sectionIndex}.items.${itemIndex}.contents.${contentIndex}.value`,
      value,
      { shouldDirty: true },
    );
  }

  function handleMediaValueChange(contentId: string, value: string): void {
    const path = findTemplateEditorContentPath(getValues("sections"), contentId);
    if (!path) {
      return;
    }

    const current = getValues(path);
    const next = withMediaValue(current, value);
    if (next !== current) {
      setValue(path, next, { shouldDirty: true });
    }
  }

  function handleFileChange(contentId: string, change: FileUploadChange): void {
    const path = findTemplateEditorContentPath(getValues("sections"), contentId);
    if (!path) {
      return;
    }

    setValue(
      path,
      {
        ...getValues(path),
        ...change,
        uploadType: change.fileName ? "upload" : undefined,
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
            onFileChange={(change) => handleFileChange(content.id, change)}
            onUploadStart={trackUpload}
            onValueChange={(value) => handleMediaValueChange(content.id, value)}
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
            key={contentIndex}
            contentIndex={contentIndex}
            itemIndex={itemIndex}
            sectionIndex={sectionIndex}
          />
        );
      case "form":
        return (
          <FormFieldsEditor
            key={contentIndex}
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
    form: "Form",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Content Blocks</h3>
        <ContentAddPanel onAddContent={handleAddContent} />
      </div>

      {contentsFieldArray.fields.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>No content blocks yet</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ContentAddPanel onAddContent={handleAddContent} />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {contentsFieldArray.fields.map((contentField, contentIndex) => {
            const typeLabel = contentTypeLabels[contents[contentIndex]?.type ?? "text"];
            const dropEdge =
              blockDrag.dropTarget?.index === contentIndex ? blockDrag.dropTarget.edge : null;
            const blockLabel = `${typeLabel} block`;

            return (
              <div
                className={cn(
                  "group relative rounded-lg border bg-card",
                  blockDrag.draggedIndex === contentIndex && "opacity-50",
                  dropIndicatorClass(dropEdge),
                )}
                data-drop-indicator={dropEdge ? `content-${dropEdge}` : undefined}
                key={contentField.fieldId}
                onDragOver={(event) => blockDrag.handleDragOver(event, contentIndex)}
                onDrop={(event) => blockDrag.handleDrop(event, contentIndex)}
              >
                <div className="flex items-center gap-1 border-b px-2 py-1.5">
                  <ReorderHandle
                    count={contentsFieldArray.fields.length}
                    handleId={`content:${contentField.id}`}
                    hintId={reorderHintId}
                    index={contentIndex}
                    label={blockLabel}
                    onDragEnd={blockDrag.finishDrag}
                    onDragStart={(event) => blockDrag.startDrag(event, contentIndex)}
                    onMove={contentsFieldArray.move}
                    onMoved={setMoveAnnouncement}
                  />
                  <span className="flex-1 pl-1 text-xs font-medium text-muted-foreground">
                    {typeLabel}
                  </span>
                  <ReorderMoveButtons
                    buttonClassName={ROW_ACTIONS_REVEAL_CLASS}
                    count={contentsFieldArray.fields.length}
                    handleId={`content:${contentField.id}`}
                    index={contentIndex}
                    label={blockLabel}
                    onMove={contentsFieldArray.move}
                    onMoved={setMoveAnnouncement}
                  />
                  <Button
                    aria-label={`Remove ${blockLabel}`}
                    className={cn(
                      "shrink-0 text-muted-foreground hover:text-destructive",
                      ROW_ACTIONS_REVEAL_CLASS,
                    )}
                    onClick={() => contentsFieldArray.remove(contentIndex)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="p-3">{renderContentEditor(contentIndex)}</div>
              </div>
            );
          })}
        </div>
      )}
      <ReorderHint announcement={moveAnnouncement} id={reorderHintId} />
    </div>
  );
}
