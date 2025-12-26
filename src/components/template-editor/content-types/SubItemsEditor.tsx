import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListCheck, Plus, Trash2 } from "lucide-react";
import { ChecklistSubItem } from "@/types/checklist";

interface SubItemsEditorProps {
  subItems: ChecklistSubItem[];
  sectionIndex: number;
  itemIndex: number;
  contentIndex: number;
  onAddSubItem: (sectionIndex: number, itemIndex: number, contentIndex: number) => void;
  onUpdateSubItem: (sectionIndex: number, itemIndex: number, contentIndex: number, subItemIndex: number, title: string) => void;
  onRemoveSubItem: (sectionIndex: number, itemIndex: number, contentIndex: number, subItemIndex: number) => void;
}

export const SubItemsEditor = ({
  subItems,
  sectionIndex,
  itemIndex,
  contentIndex,
  onAddSubItem,
  onUpdateSubItem,
  onRemoveSubItem
}: SubItemsEditorProps) => {
  const handleKeyDown = (e: React.KeyboardEvent, subItemIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Add a new subtask when Enter is pressed
      onAddSubItem(sectionIndex, itemIndex, contentIndex);
      // Focus will automatically go to the new input
      setTimeout(() => {
        const inputs = document.querySelectorAll(`[data-subtask-section="${sectionIndex}"][data-subtask-item="${itemIndex}"][data-subtask-content="${contentIndex}"]`);
        const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
        if (lastInput) {
          lastInput.focus();
        }
      }, 10);
    }
  };

  return (
    <div>
      <Label className="flex items-center gap-2 mb-3">
        <ListCheck className="h-4 w-4" /> Sub-tasks
      </Label>
      <div className="space-y-2">
        {subItems.map((subItem: { id: string; title: string }, subItemIndex: number) => (
          <div key={subItem.id} className="flex items-center gap-2">
            <Input
              value={subItem.title}
              onChange={(e) => onUpdateSubItem(
                sectionIndex,
                itemIndex,
                contentIndex,
                subItemIndex,
                e.target.value
              )}
              onKeyDown={(e) => handleKeyDown(e, subItemIndex)}
              placeholder={`Sub-task ${subItemIndex + 1}`}
              className="flex-grow"
              data-subtask-section={sectionIndex}
              data-subtask-item={itemIndex}
              data-subtask-content={contentIndex}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemoveSubItem(
                sectionIndex,
                itemIndex,
                contentIndex,
                subItemIndex
              )}
              disabled={subItems.length === 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onAddSubItem(sectionIndex, itemIndex, contentIndex)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Sub-task
        </Button>
      </div>
    </div>
  );
};