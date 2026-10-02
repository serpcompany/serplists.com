import type { JSX } from "react";
import { type KeyboardEvent } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { ListCheck, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import {
  createTemplateEditorSubItem,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";

interface SubItemsEditorProps {
  contentIndex: number;
  itemIndex: number;
  sectionIndex: number;
}

export function SubItemsEditor({
  contentIndex,
  itemIndex,
  sectionIndex,
}: SubItemsEditorProps): JSX.Element {
  const { control, setValue } = useFormContext<TemplateEditorFormValues>();
  const subItemsFieldArray = useFieldArray({
    control,
    keyName: "fieldId",
    name:
      `sections.${sectionIndex}.items.${itemIndex}.contents.${contentIndex}.subItems` as const,
  });
  const subItems =
    useWatch({
      control,
      name:
        `sections.${sectionIndex}.items.${itemIndex}.contents.${contentIndex}.subItems` as const,
    }) ?? [];

  function appendSubItem(): void {
    subItemsFieldArray.append(createTemplateEditorSubItem());
  }

  function focusLastSubItemInput(): void {
    setTimeout(() => {
      const inputs = document.querySelectorAll(
        `[data-subtask-section="${sectionIndex}"][data-subtask-item="${itemIndex}"][data-subtask-content="${contentIndex}"]`,
      );
      const lastInput = inputs[inputs.length - 1];
      if (lastInput instanceof HTMLInputElement) {
        lastInput.focus();
      }
    }, 10);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    appendSubItem();
    focusLastSubItemInput();
  }

  return (
    <FieldSet className="gap-3">
      <FieldLegend className="mb-0 flex items-center gap-2" variant="label">
        <ListCheck className="size-4" /> Sub-tasks
      </FieldLegend>
      <div className="flex flex-col gap-2">
        {subItemsFieldArray.fields.map((subItemField, subItemIndex) => (
          <div className="flex items-center gap-2" key={subItemField.fieldId}>
            <Input
              aria-label={`Sub-task ${subItemIndex + 1}`}
              className="grow"
              data-subtask-content={contentIndex}
              data-subtask-item={itemIndex}
              data-subtask-section={sectionIndex}
              onChange={(event) =>
                setValue(
                  `sections.${sectionIndex}.items.${itemIndex}.contents.${contentIndex}.subItems.${subItemIndex}.title`,
                  event.target.value,
                  { shouldDirty: true },
                )
              }
              onKeyDown={handleKeyDown}
              placeholder={`Sub-task ${subItemIndex + 1}`}
              value={subItems[subItemIndex]?.title ?? ""}
            />
            <Button
              aria-label={`Remove sub-task ${subItemIndex + 1}`}
              disabled={subItems.length === 1}
              onClick={() => subItemsFieldArray.remove(subItemIndex)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          className="w-full"
          onClick={appendSubItem}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus data-icon="inline-start" />
          Add Sub-task
        </Button>
      </div>
    </FieldSet>
  );
}
