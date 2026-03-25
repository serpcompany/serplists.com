import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChecklistItem } from "@/types/checklist";
import { ContentEditor } from "./ContentEditor";

interface ItemEditorProps {
  item: ChecklistItem;
  sectionIndex: number;
  itemIndex: number;
  onUpdateItem: (sectionIndex: number, itemIndex: number, field: string, value: string) => void;
  onAddItemContent: (sectionIndex: number, itemIndex: number, contentType: "text" | "image" | "video" | "file" | "embed" | "subItems") => void;
  onUpdateItemContent: (sectionIndex: number, itemIndex: number, contentIndex: number, value: string) => void;
  onUpdateItemContentMeta: (sectionIndex: number, itemIndex: number, contentIndex: number, updates: unknown) => void;
  onRemoveItemContent: (sectionIndex: number, itemIndex: number, contentIndex: number) => void;
  onAddSubItem: (sectionIndex: number, itemIndex: number, contentIndex: number) => void;
  onUpdateSubItem: (sectionIndex: number, itemIndex: number, contentIndex: number, subItemIndex: number, title: string) => void;
  onRemoveSubItem: (sectionIndex: number, itemIndex: number, contentIndex: number, subItemIndex: number) => void;
  errors: { type: string; message: string }[];
}

export const ItemEditor = ({
  item,
  sectionIndex,
  itemIndex,
  onUpdateItem,
  onAddItemContent,
  onUpdateItemContent,
  onUpdateItemContentMeta,
  onRemoveItemContent,
  onAddSubItem,
  onUpdateSubItem,
  onRemoveSubItem,
  errors: _errors
}: ItemEditorProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Task details</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Write the task like a docs step. The title should be scannable and the body should explain the exact action to take.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="item-title" className="text-base">Task Title</Label>
          <Input
            id="item-title"
            value={item.title}
            onChange={(e) => onUpdateItem(sectionIndex, itemIndex, "title", e.target.value)}
            placeholder={`Task ${itemIndex + 1} title`}
            className="mt-2"
          />
        </div>

        <div className="space-y-4">
          <Label htmlFor="item-description" className="text-base">Description (optional)</Label>
          <Textarea
            id="item-description"
            value={item.description || ""}
            onChange={(e) => onUpdateItem(sectionIndex, itemIndex, "description", e.target.value)}
            placeholder="Optional description or instructions"
            rows={4}
            className="mt-2"
          />
        </div>
      </div>

      <ContentEditor
        contents={item.contents || []}
        sectionIndex={sectionIndex}
        itemIndex={itemIndex}
        onAddItemContent={onAddItemContent}
        onUpdateItemContent={onUpdateItemContent}
        onUpdateItemContentMeta={onUpdateItemContentMeta}
        onRemoveItemContent={onRemoveItemContent}
        onAddSubItem={onAddSubItem}
        onUpdateSubItem={onUpdateSubItem}
        onRemoveSubItem={onRemoveSubItem}
      />
    </div>
  );
};
