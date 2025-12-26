import { Button } from "@/components/ui/button";
import { 
  FileText, Image, Video, File, Code, ListCheck, 
  X, PanelRightOpen
} from "lucide-react";

interface ContentAddPanelProps {
  showAddPanel: boolean;
  onTogglePanel: () => void;
  onAddContent: (contentType: "text" | "image" | "video" | "file" | "embed" | "subItems" | "page") => void;
}

export const ContentAddPanel = ({ 
  showAddPanel, 
  onTogglePanel, 
  onAddContent 
}: ContentAddPanelProps) => {
  const contentTypeButtons = [
    { type: "text" as const, icon: FileText, label: "Add Text" },
    { type: "image" as const, icon: Image, label: "Add Image" },
    { type: "video" as const, icon: Video, label: "Add Video" },
    { type: "file" as const, icon: File, label: "Add File" },
    { type: "embed" as const, icon: Code, label: "Add Embed" },
    { type: "subItems" as const, icon: ListCheck, label: "Add Sub-tasks" },
    { type: "page" as const, icon: FileText, label: "Add Page" },
  ];

  return (
    <div className="flex items-center justify-between mb-6">
      <h3 className="text-lg font-semibold">Content</h3>
      <Button 
        variant="outline" 
        size="sm"
        onClick={onTogglePanel}
      >
        <PanelRightOpen className="mr-2 h-4 w-4" />
        Add Content
      </Button>

      {/* Add Content Panel - Modal Style */}
      {showAddPanel && (
        <>
          {/* Invisible Overlay for click-outside */}
          <div 
            className="fixed inset-0 z-40"
            onClick={onTogglePanel}
          />
          
          {/* Modal Panel */}
          <div className="fixed right-4 top-1/2 transform -translate-y-1/2 w-64 h-96 border bg-background shadow-lg rounded-lg p-4 overflow-y-auto z-50">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold">Add Content</h4>
              <Button
                variant="ghost"
                size="icon"
                onClick={onTogglePanel}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {contentTypeButtons.map(({ type, icon: Icon, label }) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onAddContent(type)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};