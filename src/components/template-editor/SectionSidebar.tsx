import { useState, type KeyboardEvent } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTemplateEditorItem,
  createTemplateEditorSection,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
import { cn } from "@/lib/utils";

type EditingItemState = {
  itemIndex: number;
  sectionIndex: number;
};

interface SectionSidebarProps {
  selectedSectionIndex: number;
  selectedItemIndex: number | null;
  onSelectSection: (sectionIndex: number) => void;
  onSelectItem: (sectionIndex: number, itemIndex: number) => void;
}

interface SectionSidebarSectionProps {
  editingItem: EditingItemState | null;
  editingSectionIndex: number | null;
  editingValue: string;
  onEditItem: (sectionIndex: number, itemIndex: number, currentTitle: string) => void;
  onEditSection: (sectionIndex: number, currentTitle: string) => void;
  onEditingValueChange: (value: string) => void;
  onRemoveSection: (sectionIndex: number) => void;
  onSelectItem: (sectionIndex: number, itemIndex: number) => void;
  onSelectSection: (sectionIndex: number) => void;
  onStopEditing: () => void;
  sectionFieldId: string;
  sectionIndex: number;
  selectedItemIndex: number | null;
  selectedSectionIndex: number;
}

function isEditingItem(
  editingItem: EditingItemState | null,
  sectionIndex: number,
  itemIndex: number,
): boolean {
  return (
    editingItem?.sectionIndex === sectionIndex &&
    editingItem?.itemIndex === itemIndex
  );
}

function buildSectionFallbackLabel(sectionIndex: number): string {
  return `Section ${sectionIndex + 1}`;
}

function buildItemFallbackLabel(itemIndex: number): string {
  return `Task ${itemIndex + 1}`;
}

function SectionSidebarSection({
  editingItem,
  editingSectionIndex,
  editingValue,
  onEditItem,
  onEditSection,
  onEditingValueChange,
  onRemoveSection,
  onSelectItem,
  onSelectSection,
  onStopEditing,
  sectionFieldId,
  sectionIndex,
  selectedItemIndex,
  selectedSectionIndex,
}: SectionSidebarSectionProps): JSX.Element {
  const { control, setValue } = useFormContext<TemplateEditorFormValues>();
  const itemsFieldArray = useFieldArray({
    control,
    keyName: "fieldId",
    name: `sections.${sectionIndex}.items` as const,
  });
  const section = useWatch({
    control,
    name: `sections.${sectionIndex}` as const,
  });

  function handleSectionSave(): void {
    setValue(`sections.${sectionIndex}.title`, editingValue, { shouldDirty: true });
    onStopEditing();
  }

  function handleItemSave(itemIndex: number): void {
    setValue(`sections.${sectionIndex}.items.${itemIndex}.title`, editingValue, {
      shouldDirty: true,
    });
    onStopEditing();
  }

  function handleKeyPress(
    event: KeyboardEvent<HTMLInputElement>,
    type: "item" | "section",
    itemIndex?: number,
  ): void {
    if (event.key === "Enter") {
      if (type === "section") {
        handleSectionSave();
        return;
      }

      if (typeof itemIndex === "number") {
        handleItemSave(itemIndex);
      }
      return;
    }

    if (event.key === "Escape") {
      onStopEditing();
    }
  }

  return (
    <div
      className={cn(
        "border-b border-border/70 last:border-b-0",
        selectedSectionIndex === sectionIndex && "bg-muted/35",
      )}
      key={sectionFieldId}
    >
      <div className="p-4">
        <div
          className="flex items-center justify-between"
          onClick={() => onSelectSection(sectionIndex)}
        >
          <div className="min-w-0 flex-1">
            {editingSectionIndex === sectionIndex ? (
              <Input
                autoFocus
                className="h-7 border-border/70 bg-background px-2 text-sm font-medium"
                onBlur={handleSectionSave}
                onChange={(event) => onEditingValueChange(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => handleKeyPress(event, "section")}
                value={editingValue}
              />
            ) : (
              <h3
                className="cursor-pointer truncate text-sm font-medium hover:text-primary"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onEditSection(
                    sectionIndex,
                    section?.title || buildSectionFallbackLabel(sectionIndex),
                  );
                }}
              >
                {section?.title || buildSectionFallbackLabel(sectionIndex)}
              </h3>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {section?.items.length ?? 0} task
              {section?.items.length === 1 ? "" : "s"}
            </p>
          </div>
                  <Button
            className="h-7 w-7 shrink-0 rounded-lg"
            onClick={(event) => {
              event.stopPropagation();
              onRemoveSection(sectionIndex);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-3 space-y-1">
          {itemsFieldArray.fields.map((itemField, itemIndex) => {
            const item = section?.items[itemIndex];
            const selected =
              selectedSectionIndex === sectionIndex &&
              selectedItemIndex === itemIndex;

            return (
              <div
                className={cn(
                  "cursor-pointer rounded-lg border-l-2 px-3 py-2.5 text-sm transition-all duration-200",
                  selected
                    ? "border-primary bg-background text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
                key={itemField.fieldId}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectItem(sectionIndex, itemIndex);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  {isEditingItem(editingItem, sectionIndex, itemIndex) ? (
                    <Input
                      autoFocus
                      className="h-7 flex-1 border-border/70 bg-background px-2 text-sm font-medium"
                      onBlur={() => handleItemSave(itemIndex)}
                      onChange={(event) => onEditingValueChange(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => handleKeyPress(event, "item", itemIndex)}
                      value={editingValue}
                    />
                  ) : (
                    <span
                      className="flex-1 cursor-pointer truncate font-medium hover:text-primary"
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        onEditItem(
                          sectionIndex,
                          itemIndex,
                          item?.title || buildItemFallbackLabel(itemIndex),
                        );
                      }}
                    >
                      {item?.title || buildItemFallbackLabel(itemIndex)}
                    </span>
                  )}
                  <Button
                    className={cn(
                      "h-6 w-6 shrink-0 rounded-lg",
                      selected
                        ? "opacity-70 hover:opacity-100"
                        : "opacity-60 hover:opacity-100",
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      itemsFieldArray.remove(itemIndex);
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
          <Button
            className="mt-2 h-9 w-full rounded-lg border border-dashed border-border/80 text-sm hover:border-border hover:bg-muted/30"
            onClick={(event) => {
              event.stopPropagation();
              itemsFieldArray.append(createTemplateEditorItem());
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SectionSidebar({
  selectedSectionIndex,
  selectedItemIndex,
  onSelectSection,
  onSelectItem,
}: SectionSidebarProps): JSX.Element {
  const { control } = useFormContext<TemplateEditorFormValues>();
  const sectionsFieldArray = useFieldArray({
    control,
    keyName: "fieldId",
    name: "sections",
  });
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(
    null,
  );
  const [editingItem, setEditingItem] = useState<EditingItemState | null>(null);
  const [editingValue, setEditingValue] = useState("");

  function handleAddSection(): void {
    sectionsFieldArray.append(createTemplateEditorSection());
  }

  function handleRemoveSection(sectionIndex: number): void {
    if (sectionsFieldArray.fields.length <= 1) {
      toast.error("You must have at least one section");
      return;
    }

    sectionsFieldArray.remove(sectionIndex);
  }

  function handleEditItem(
    sectionIndex: number,
    itemIndex: number,
    currentTitle: string,
  ): void {
    setEditingSectionIndex(null);
    setEditingItem({ itemIndex, sectionIndex });
    setEditingValue(currentTitle);
  }

  function handleEditSection(sectionIndex: number, currentTitle: string): void {
    setEditingItem(null);
    setEditingSectionIndex(sectionIndex);
    setEditingValue(currentTitle);
  }

  function handleStopEditing(): void {
    setEditingItem(null);
    setEditingSectionIndex(null);
    setEditingValue("");
  }

  return (
    <div className="docs-panel sticky top-20 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-4">
        <div>
          <h2 className="text-base font-semibold">Sections</h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Keep the outline short and scannable.
          </p>
        </div>
        <Button
          className="rounded-lg"
          onClick={handleAddSection}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div>
        {sectionsFieldArray.fields.map((sectionField, sectionIndex) => (
          <SectionSidebarSection
            editingItem={editingItem}
            editingSectionIndex={editingSectionIndex}
            editingValue={editingValue}
            key={sectionField.fieldId}
            onEditItem={handleEditItem}
            onEditSection={handleEditSection}
            onEditingValueChange={setEditingValue}
            onRemoveSection={handleRemoveSection}
            onSelectItem={onSelectItem}
            onSelectSection={onSelectSection}
            onStopEditing={handleStopEditing}
            sectionFieldId={sectionField.fieldId}
            sectionIndex={sectionIndex}
            selectedItemIndex={selectedItemIndex}
            selectedSectionIndex={selectedSectionIndex}
          />
        ))}
      </div>
    </div>
  );
}
