import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { ChecklistItemContent } from "@/types/checklist";
import { Page } from "@/types/page";
import { ContentAddPanel } from "./ContentAddPanel";
import { TextContentEditor } from "./content-types/TextContentEditor";
import { MediaContentEditor } from "./content-types/MediaContentEditor";
import { EmbedContentEditor } from "./content-types/EmbedContentEditor";
import { SubItemsEditor } from "./content-types/SubItemsEditor";
import { PageContentEditor } from "./content-types/PageContentEditor";

interface ContentEditorProps {
  contents: ChecklistItemContent[];
  sectionIndex: number;
  itemIndex: number;
  pages?: Page[];
  onAddItemContent: (sectionIndex: number, itemIndex: number, contentType: "text" | "image" | "video" | "file" | "embed" | "subItems" | "page") => void;
  onUpdateItemContent: (sectionIndex: number, itemIndex: number, contentIndex: number, value: string) => void;
  onUpdateItemContentMeta: (sectionIndex: number, itemIndex: number, contentIndex: number, updates: unknown) => void;
  onRemoveItemContent: (sectionIndex: number, itemIndex: number, contentIndex: number) => void;
  onAddSubItem: (sectionIndex: number, itemIndex: number, contentIndex: number) => void;
  onUpdateSubItem: (sectionIndex: number, itemIndex: number, contentIndex: number, subItemIndex: number, title: string) => void;
  onRemoveSubItem: (sectionIndex: number, itemIndex: number, contentIndex: number, subItemIndex: number) => void;
}

export const ContentEditor = ({
  contents,
  sectionIndex,
  itemIndex,
  pages = [],
  onAddItemContent,
  onUpdateItemContent,
  onUpdateItemContentMeta,
  onRemoveItemContent,
  onAddSubItem,
  onUpdateSubItem,
  onRemoveSubItem
}: ContentEditorProps) => {
  const [showAddPanel, setShowAddPanel] = useState(false);

  const handleAddContent = (contentType: "text" | "image" | "video" | "file" | "embed" | "subItems" | "page") => {
    onAddItemContent(sectionIndex, itemIndex, contentType);
  };

  const renderContentEditor = (content: ChecklistItemContent, contentIndex: number) => {
    const commonProps = {
      key: `content-${contentIndex}`,
      value: content.value,
      onValueChange: (value: string) => onUpdateItemContent(sectionIndex, itemIndex, contentIndex, value),
      onUpdateMeta: (updates: unknown[]) => onUpdateItemContentMeta(sectionIndex, itemIndex, contentIndex, updates)
    };

    switch (content.type) {
      case "text":
        return (
          <TextContentEditor
            value={content.value}
            onChange={(value: unknown) => onUpdateItemContent(sectionIndex, itemIndex, contentIndex, value)}
          />
        );

      case "image":
      case "video":
      case "file":
        return (
          <MediaContentEditor
            type={content.type}
            value={content.value}
            fileName={content.fileName}
            onValueChange={(value: unknown) => onUpdateItemContent(sectionIndex, itemIndex, contentIndex, value)}
            onFileInfoChange={(fileName: string, fileSize: number) => onUpdateItemContentMeta(sectionIndex, itemIndex, contentIndex, { fileName, fileSize })}
          />
        );

      case "embed":
        return (
          <EmbedContentEditor
            value={content.value}
            onValueChange={(value: unknown) => onUpdateItemContent(sectionIndex, itemIndex, contentIndex, value)}
          />
        );

      case "subItems":
        return (
          <SubItemsEditor
            subItems={content.subItems || []}
            sectionIndex={sectionIndex}
            itemIndex={itemIndex}
            contentIndex={contentIndex}
            onAddSubItem={onAddSubItem}
            onUpdateSubItem={onUpdateSubItem}
            onRemoveSubItem={onRemoveSubItem}
          />
        );

      case "page":
        return (
          <PageContentEditor
            value={content.value}
            pageId={content.pageId}
            pages={pages}
            onValueChange={(value: unknown) => onUpdateItemContent(sectionIndex, itemIndex, contentIndex, value)}
            onUpdateMeta={(updates: unknown[]) => onUpdateItemContentMeta(sectionIndex, itemIndex, contentIndex, updates)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex gap-6">
      <div className="flex-1 transition-all duration-200">
        <ContentAddPanel
          showAddPanel={showAddPanel}
          onTogglePanel={() => setShowAddPanel(!showAddPanel)}
          onAddContent={handleAddContent}
        />
        
        <div className="space-y-4">
          {contents.map((content, contentIndex: number) => (
            <div key={`content-${contentIndex}`} className="relative rounded-md border p-4">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2"
                onClick={() => onRemoveItemContent(sectionIndex, itemIndex, contentIndex)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              
              {renderContentEditor(content, contentIndex)}
            </div>
          ))}
          
          {contents.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No content added yet.</p>
              <p className="text-sm">Use the "Add Content" button above to add text, images, videos, files, embeds, pages, or sub-tasks.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};