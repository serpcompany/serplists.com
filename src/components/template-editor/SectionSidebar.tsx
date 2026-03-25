import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { ChecklistSection } from "@/types/checklist";
import { cn } from "@/lib/utils";

interface SectionSidebarProps {
  sections: ChecklistSection[];
  selectedSectionIndex: number;
  selectedItemIndex: number | null;
  onSelectSection: (sectionIndex: number) => void;
  onSelectItem: (sectionIndex: number, itemIndex: number) => void;
  onAddSection: () => void;
  onRemoveSection: (index: number) => void;
  onAddItem: (sectionIndex: number) => void;
  onRemoveItem: (sectionIndex: number, itemIndex: number) => void;
  onUpdateSection: (sectionIndex: number, field: string, value: string) => void;
  onUpdateItem: (sectionIndex: number, itemIndex: number, field: string, value: string) => void;
}

export const SectionSidebar = ({
  sections,
  selectedSectionIndex,
  selectedItemIndex,
  onSelectSection,
  onSelectItem,
  onAddSection,
  onRemoveSection,
  onAddItem,
  onRemoveItem,
  onUpdateSection,
  onUpdateItem
}: SectionSidebarProps) => {
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  

  const handleSectionDoubleClick = (sectionIndex: number, currentTitle: string) => {
    setEditingSectionIndex(sectionIndex);
    setEditingValue(currentTitle || `Section ${sectionIndex + 1}`);
  };

  const handleItemDoubleClick = (sectionIndex: number, itemIndex: number, currentTitle: string) => {
    setEditingItemIndex(itemIndex);
    setEditingValue(currentTitle || `Task ${itemIndex + 1}`);
  };

  const handleSectionSave = (sectionIndex: number) => {
    onUpdateSection(sectionIndex, 'title', editingValue);
    setEditingSectionIndex(null);
    setEditingValue("");
  };

  const handleItemSave = (sectionIndex: number, itemIndex: number) => {
    onUpdateItem(sectionIndex, itemIndex, 'title', editingValue);
    setEditingItemIndex(null);
    setEditingValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent, type: 'section' | 'item', sectionIndex: number, itemIndex?: number) => {
    if (e.key === 'Enter') {
      if (type === 'section') {
        handleSectionSave(sectionIndex);
      } else if (itemIndex !== undefined) {
        handleItemSave(sectionIndex, itemIndex);
      }
    } else if (e.key === 'Escape') {
      setEditingSectionIndex(null);
      setEditingItemIndex(null);
      setEditingValue("");
    }
  };

  return (
    <div className="docs-panel sticky top-24 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-4">
        <div>
          <h2 className="text-base font-semibold">Sections</h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Keep the outline flat and readable.
          </p>
        </div>
        <Button onClick={onAddSection} size="sm" variant="outline" className="rounded-lg">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div>
        {sections.map((section: { id: string; title: string; items: unknown[] }, sectionIndex: number) => (
          <div
            key={section.id}
            className={cn(
              "border-b border-border/70 last:border-b-0",
              selectedSectionIndex === sectionIndex && "bg-muted/35",
            )}
          >
            <div className="p-4">
              <div className="flex items-center justify-between" onClick={() => {
                onSelectSection(sectionIndex);
              }}>
                <div className="flex-1 min-w-0">
                  {editingSectionIndex === sectionIndex ? (
                    <Input
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => handleSectionSave(sectionIndex)}
                      onKeyDown={(e) => handleKeyPress(e, 'section', sectionIndex)}
                      className="h-7 border-border/70 bg-background px-2 text-sm font-medium"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h3 
                      className="text-sm font-medium truncate cursor-pointer hover:text-primary"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleSectionDoubleClick(sectionIndex, section.title);
                      }}
                    >
                      {section.title || `Section ${sectionIndex + 1}`}
                    </h3>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {section.items.length} task{section.items.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-lg" onClick={(e) => {
                  e.stopPropagation();
                  onRemoveSection(sectionIndex);
                }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              
              <div className="mt-3 space-y-1">
                {section.items.map((item: { id: string; title: string }, itemIndex: number) => (
                  <div 
                    key={item.id} 
                    className={`cursor-pointer rounded-lg border-l-2 px-3 py-2.5 text-sm transition-all duration-200 ${
                      selectedSectionIndex === sectionIndex && selectedItemIndex === itemIndex 
                        ? 'border-primary bg-background text-foreground'
                        : 'border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`} 
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectItem(sectionIndex, itemIndex);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {editingItemIndex === itemIndex && editingSectionIndex === null ? (
                        <Input
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => handleItemSave(sectionIndex, itemIndex)}
                          onKeyDown={(e) => handleKeyPress(e, 'item', sectionIndex, itemIndex)}
                          className="h-7 flex-1 border-border/70 bg-background px-2 text-sm font-medium"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span 
                          className="truncate flex-1 font-medium cursor-pointer hover:text-primary"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleItemDoubleClick(sectionIndex, itemIndex, item.title);
                          }}
                        >
                          {item.title || `Task ${itemIndex + 1}`}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 shrink-0 rounded-lg ${
                          selectedSectionIndex === sectionIndex && selectedItemIndex === itemIndex
                            ? 'opacity-70 hover:opacity-100'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveItem(sectionIndex, itemIndex);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="mt-2 h-9 w-full rounded-lg border border-dashed border-border/80 text-sm hover:border-border hover:bg-muted/30" onClick={(e) => {
                  e.stopPropagation();
                  onAddItem(sectionIndex);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
