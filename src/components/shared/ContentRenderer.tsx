import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Checkbox } from '@/components/ui/checkbox';
import { VideoEmbed } from './VideoEmbed';
import { File, Code, ListCheck } from 'lucide-react';
import { ChecklistItemContent, ChecklistSubItem } from '@/types/checklist';
import { normalizeMarkdownDisplayText } from '@/lib/utils/markdownDisplay';
import { safeUrl } from '@/lib/utils/safeUrl';

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
            <div className="prose prose-sm max-w-none whitespace-pre-line">
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeUrl}>
                {normalizeMarkdownDisplayText(content.value)}
              </ReactMarkdown>
            </div>
          )}
          
          {content.type === "image" && content.value && (
            <div className="rounded-lg border overflow-hidden">
              <img 
                src={safeUrl(content.value) || "https://placehold.co/400x200?text=Invalid+Image"} 
                alt="Task content" 
                className="w-full max-h-96 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://placehold.co/400x200?text=Invalid+Image";
                }}
              />
            </div>
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
                    href={safeUrl(content.value)} 
                    target="_blank" 
                    rel="noopener noreferrer"
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
                  href={safeUrl(content.value)} 
                  target="_blank" 
                  rel="noopener noreferrer"
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
                      aria-label={subItem.title?.trim() || `Sub-task ${subItemIndex + 1}`}
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
    </div>
  );
};
