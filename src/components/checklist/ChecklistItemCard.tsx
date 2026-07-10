import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { normalizeDisplayText } from '@/lib/utils/markdownDisplay';
import { ChecklistItem, ChecklistSection } from '@/types/checklist';

interface ChecklistItemCardProps {
  item: ChecklistItem;
  section: ChecklistSection;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  onItemToggle: (itemId: string, isCompleted: boolean) => void;
  onSubItemToggle?: (itemId: string, contentIndex: number, subItemIndex: number, isCompleted: boolean) => void;
  showProgress?: boolean;
}

export const ChecklistItemCard: React.FC<ChecklistItemCardProps> = ({
  item,
  section,
  isExpanded,
  isSelected,
  onToggleExpand,
  onSelect,
  onItemToggle,
  onSubItemToggle,
  showProgress = false
}) => {
  const handleItemToggle = () => {
    onItemToggle(item.id, !item.isCompleted);
  };

  return (
    <Card className={`mb-2 ${isSelected ? 'ring-2 ring-primary' : ''} ${item.isCompleted ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={item.isCompleted || false}
            onCheckedChange={handleItemToggle}
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <CardTitle 
              className={`text-base cursor-pointer ${item.isCompleted ? 'line-through text-muted-foreground' : ''}`}
              onClick={onSelect}
            >
              {item.title}
            </CardTitle>
            {item.description && (
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {normalizeDisplayText(item.description)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              From section: {section.title}
            </p>
          </div>
          {item.contents && item.contents.length > 0 && (
            <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          )}
        </div>
      </CardHeader>
      
      {item.contents && item.contents.length > 0 && (
        <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
          <CollapsibleContent>
            <CardContent>
              <ContentRenderer 
                contents={item.contents}
                disabled={false}
                onSubItemToggle={
                  onSubItemToggle
                    ? (contentIndex, subItemIndex, isCompleted) => onSubItemToggle(item.id, contentIndex, subItemIndex, isCompleted)
                    : undefined
                }
              />
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
};
