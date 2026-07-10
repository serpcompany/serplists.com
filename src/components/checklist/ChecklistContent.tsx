import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle } from 'lucide-react';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { normalizeDisplayText } from '@/lib/utils/markdownDisplay';
import { ChecklistItem, ChecklistSection } from '@/types/checklist';

interface ChecklistContentProps {
  selectedData: { item: ChecklistItem; section: ChecklistSection } | null;
  disabled?: boolean;
  onItemToggle?: (itemId: string, isCompleted: boolean) => void;
  onSubItemToggle?: (itemId: string, contentIndex: number, subItemIndex: number, isCompleted: boolean) => void;
  actions?: React.ReactNode;
}

export const ChecklistContent: React.FC<ChecklistContentProps> = ({
  selectedData,
  disabled = false,
  onItemToggle,
  onSubItemToggle,
  actions,
}) => {
  if (!selectedData) {
    return (
      <div className="px-6 py-16 text-center">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Select a task from the sidebar to view details</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <div className="border-b border-border bg-secondary/20 px-6 py-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selectedData.item.isCompleted || false}
              disabled={disabled || !onItemToggle}
              className={disabled || !onItemToggle ? "opacity-50" : ""}
              onCheckedChange={() => onItemToggle?.(selectedData.item.id, !selectedData.item.isCompleted)}
            />
            <div>
              <h2 className={`text-2xl font-semibold ${selectedData.item.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                {selectedData.item.title}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                From section: {selectedData.section.title}
              </p>
            </div>
          </div>
        </div>
        {selectedData.item.description && (
          <p className="whitespace-pre-line text-muted-foreground">
            {normalizeDisplayText(selectedData.item.description)}
          </p>
        )}
      </div>
      
      <div className="px-6 py-6">
        <ContentRenderer 
          contents={selectedData.item.contents || []} 
          disabled={disabled}
          onSubItemToggle={(contentIndex, subItemIndex, isCompleted) =>
            onSubItemToggle?.(selectedData.item.id, contentIndex, subItemIndex, isCompleted)
          }
        />
      </div>

      {actions ? <div className="flex justify-end border-t border-border bg-secondary/10 px-6 py-4">{actions}</div> : null}
    </div>
  );
};
