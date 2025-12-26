import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ChecklistTemplate } from '@/types/checklist';

interface ChecklistSidebarProps {
  template: ChecklistTemplate;
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
}

export const ChecklistSidebar: React.FC<ChecklistSidebarProps> = ({
  template,
  selectedItemId,
  onSelectItem
}) => {
  return (
    <Card className="sticky top-4 max-h-[calc(100vh-8rem)] overflow-auto">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Tasks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 p-0">
        {template.sections.map((section: { id: unknown; title: unknown; items: unknown }) => (
          <div key={section.id}>
            <div className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted/30">
              {section.title}
            </div>
            {section.items.map((item: { id: unknown; title: unknown; contents: unknown }) => {
              const isSelected = selectedItemId === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectItem(item.id)}
                  className={`w-full text-left px-4 py-3 border-l-2 transition-colors hover:bg-muted/50 ${
                    isSelected 
                      ? 'border-l-primary bg-muted/70 text-primary' 
                      : 'border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox disabled className="opacity-50" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.title}
                      </div>
                      {item.contents && item.contents.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {item.contents.length} content item{item.contents.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};