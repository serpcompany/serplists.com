import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { ChecklistSection } from "@/types/checklist";

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
  
  console.log('SectionSidebar state:', { editingSectionIndex, editingItemIndex, editingValue });

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
    <div className="sticky top-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Sections</h2>
        <Button onClick={onAddSection} size="sm" variant="outline">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="space-y-2">
        {sections.map((section: { id: string; title: string; items: unknown[] }, sectionIndex: number) => (
          <Card key={section.id} className={`cursor-pointer transition-colors ${selectedSectionIndex === sectionIndex ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
            <CardContent className="p-4">
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
                      className="text-sm font-medium h-6 px-1"
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
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => {
                  e.stopPropagation();
                  onRemoveSection(sectionIndex);
                }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              
              {/* Items in this section */}
              <div className="mt-3 space-y-2">
                {section.items.map((item: { id: string; title: string }, itemIndex: number) => (
                  <div 
                    key={item.id} 
                    className={`text-sm p-3 rounded-md cursor-pointer transition-all duration-200 ${
                      selectedSectionIndex === sectionIndex && selectedItemIndex === itemIndex 
                        ? 'bg-primary text-primary-foreground shadow-sm' 
                        : 'bg-muted/50 hover:bg-muted border border-transparent hover:border-border'
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
                          className="text-sm font-medium h-6 px-1 flex-1"
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
                        className={`h-6 w-6 shrink-0 ${
                          selectedSectionIndex === sectionIndex && selectedItemIndex === itemIndex 
                            ? 'opacity-70 hover:opacity-100 text-primary-foreground' 
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
                <Button variant="ghost" size="sm" className="w-full text-sm h-9 mt-2 border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50" onClick={(e) => {
                  e.stopPropagation();
                  onAddItem(sectionIndex);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};