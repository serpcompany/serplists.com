import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { VideoEmbed } from './VideoEmbed';
import { File, Code, ListCheck, ZoomIn } from 'lucide-react';
import { ChecklistItemContent, ChecklistSubItem } from '@/types/checklist';
import { normalizeMarkdownDisplayText } from '@/lib/utils/markdownDisplay';
import { getOutboundLinkProps } from '@/lib/utils/clipyUrl';
import { safeUrl } from '@/lib/utils/safeUrl';
import { MarkdownText } from './MarkdownText';

interface ContentRendererProps {
  contents: ChecklistItemContent[];
  disabled?: boolean;
  onSubItemToggle?: (contentIndex: number, subItemIndex: number, isCompleted: boolean) => void;
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({ 
  contents, 
  disabled = false,
  onSubItemToggle,
}) => {
  const [expandedImageUrl, setExpandedImageUrl] = React.useState<string | null>(null);

  if (!contents || contents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <File className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No additional content for this task</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {contents.map((content, contentIndex: number) => (
        <div key={contentIndex} className="space-y-3">
          {content.type === "text" && content.value && (
            <MarkdownText>{normalizeMarkdownDisplayText(content.value)}</MarkdownText>
          )}
          
          {content.type === "image" && content.value && (
            <button
              type="button"
              aria-label="View image full size"
              className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() =>
                setExpandedImageUrl(
                  safeUrl(content.value) || "https://placehold.co/400x200?text=Invalid+Image",
                )
              }
            >
              <img 
                src={safeUrl(content.value) || "https://placehold.co/400x200?text=Invalid+Image"} 
                alt="Task content" 
                className="w-full max-h-96 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://placehold.co/400x200?text=Invalid+Image";
                }}
              />
              <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-black/75 px-2.5 py-1.5 text-xs font-medium text-white opacity-90 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <ZoomIn aria-hidden="true" className="h-3.5 w-3.5" />
                View full size
              </span>
            </button>
          )}
          
          {content.type === "video" && content.value && (
            <div className="rounded-lg border overflow-hidden">
              <VideoEmbed title="Task video content" url={content.value} />
            </div>
          )}
          
          {content.type === "file" && content.value && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <File className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">{content.fileName || "File"}</p>
                  <a 
                    {...getOutboundLinkProps(safeUrl(content.value))}
                    aria-label={`Download ${content.fileName || "file"}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Download File
                  </a>
                </div>
              </div>
            </div>
          )}
          
          {content.type === "embed" && content.value && (
            <div className="border rounded-lg p-4 bg-muted/20">
              {safeUrl(content.value) ? (
                <a 
                  {...getOutboundLinkProps(safeUrl(content.value))}
                  aria-label="Open embedded content"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <Code className="h-4 w-4" />
                  Open Embedded Content
                </a>
              ) : (
                <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {content.value}
                </pre>
              )}
            </div>
          )}
          
          {content.type === "subItems" && content.subItems && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ListCheck className="h-5 w-5 text-muted-foreground" />
                <h4 className="font-medium">Sub-tasks</h4>
              </div>
              <div className="space-y-2 pl-7">
                {content.subItems.map((subItem: ChecklistSubItem, subItemIndex: number) => (
                  <div key={subItem.id} className="flex items-center gap-3 rounded-md border border-border/70 p-3">
                    <Checkbox
                      checked={!!subItem.isCompleted}
                      disabled={disabled || !onSubItemToggle}
                      className={disabled || !onSubItemToggle ? "opacity-50" : ""}
                      onCheckedChange={() =>
                        onSubItemToggle?.(contentIndex, subItemIndex, !subItem.isCompleted)
                      }
                    />
                    <span className={subItem.isCompleted ? "line-through text-muted-foreground" : ""}>{subItem.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <Dialog
        open={expandedImageUrl !== null}
        onOpenChange={(open) => {
          if (!open) setExpandedImageUrl(null);
        }}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] border-white/10 bg-black/95 p-2 text-white shadow-2xl sm:rounded-lg">
          <DialogTitle className="sr-only">Image preview</DialogTitle>
          <DialogDescription className="sr-only">
            Expanded task image. Close this dialog to return to the checklist.
          </DialogDescription>
          {expandedImageUrl ? (
            <img
              src={expandedImageUrl}
              alt="Task content, expanded"
              className="mx-auto max-h-[calc(100vh-4rem)] max-w-full object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
