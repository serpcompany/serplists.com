import { ChecklistSection, ChecklistItem, ChecklistContent } from "@/contexts/TemplatesContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, FileText, Video, Image, Link2, ListTodo } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface PublicTemplateContentProps {
  sections: ChecklistSection[];
}

export function PublicTemplateContent({ sections }: PublicTemplateContentProps) {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleItem = (itemId: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const renderContent = (content: ChecklistContent) => {
    switch (content.type) {
      case "text":
        return content.value ? (
          <div className="mt-2 p-3 bg-muted/50 rounded-md">
            <p className="text-sm">{content.value}</p>
          </div>
        ) : null;
      
      case "video":
        return content.value ? (
          <div className="mt-2 p-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2 text-sm">
              <Video className="h-4 w-4" />
              <span>Video content</span>
            </div>
          </div>
        ) : null;
      
      case "image":
        return content.value ? (
          <div className="mt-2 p-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2 text-sm">
              <Image className="h-4 w-4" />
              <span>Image content</span>
            </div>
          </div>
        ) : null;
      
      case "link":
        return content.value ? (
          <div className="mt-2 p-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4" />
              <a href={content.value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {content.value}
              </a>
            </div>
          </div>
        ) : null;
      
      case "page":
        return content.value ? (
          <div className="mt-2 p-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4" />
              <span>Page reference</span>
            </div>
          </div>
        ) : null;
      
      case "subItems":
        return content.subItems && content.subItems.length > 0 ? (
          <div className="mt-3 ml-6 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ListTodo className="h-4 w-4" />
              <span>Sub-tasks:</span>
            </div>
            {content.subItems.map((subItem, index) => (
              <div key={subItem.id || index} className="flex items-center gap-2 ml-4">
                <Checkbox disabled className="h-4 w-4" />
                <span className="text-sm">{subItem.title}</span>
              </div>
            ))}
          </div>
        ) : null;
      
      default:
        return null;
    }
  };

  const renderItem = (item: ChecklistItem, sectionIndex: number, itemIndex: number) => {
    const itemKey = `${sectionIndex}-${itemIndex}`;
    const isExpanded = expandedItems[itemKey];
    const hasContent = item.contents && item.contents.length > 0;
    const hasDescription = item.description && item.description.trim() !== "";

    return (
      <div key={item.id || itemIndex} className="border-l-2 border-muted pl-4 py-2">
        <div className="flex items-start gap-3">
          <Checkbox disabled className="h-5 w-5 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {(hasContent || hasDescription) && (
                <button
                  onClick={() => toggleItem(itemKey)}
                  className="p-0.5 hover:bg-muted rounded transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              )}
              <span className={cn(
                "font-medium",
                (hasContent || hasDescription) && "cursor-pointer hover:text-primary transition-colors"
              )}
              onClick={() => (hasContent || hasDescription) && toggleItem(itemKey)}
              >
                {item.title || item.text}
              </span>
            </div>
            
            {isExpanded && (
              <>
                {hasDescription && (
                  <p className="text-sm text-muted-foreground mt-2">{item.description}</p>
                )}
                
                {hasContent && (
                  <div className="mt-2 space-y-2">
                    {item.contents.map((content, contentIndex) => (
                      <div key={content.id || contentIndex}>
                        {renderContent(content)}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {sections && sections.length > 0 ? (
        sections.map((section, sectionIndex) => (
          <Card key={section.id || sectionIndex}>
            <CardHeader>
              <CardTitle className="text-lg">{section.title}</CardTitle>
              {section.description && (
                <CardDescription>{section.description}</CardDescription>
              )}
            </CardHeader>
            
            {section.items && section.items.length > 0 && (
              <CardContent className="space-y-1">
                {section.items.map((item, itemIndex) => 
                  renderItem(item, sectionIndex, itemIndex)
                )}
              </CardContent>
            )}
          </Card>
        ))
      ) : (
        <p className="text-muted-foreground">No sections available for this template.</p>
      )}
    </div>
  );
}