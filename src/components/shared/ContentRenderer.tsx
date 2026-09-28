import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { MarkdownBlock } from './MarkdownBlock';
import { TaskImage } from './TaskImage';
import { VideoEmbed } from './VideoEmbed';
import { File, Code, ListCheck } from 'lucide-react';
import { ChecklistItemContent, ChecklistSubItem } from '@/types/checklist';
import { getSubItemDisplayTitle } from '@/lib/utils/checklistSections';
import { getEmbedLinkUrl } from '@/lib/utils/embedLink';
import { hasCurrentFileInfo } from '@/lib/utils/mediaSource';
import { safeUrl } from '@/lib/utils/safeUrl';

// A file's name, unless it was left over from an upload the value no longer points to.
const fileLabel = (content: ChecklistItemContent): string | undefined =>
  hasCurrentFileInfo(content) ? content.fileName : undefined;

type LooseRecord = Record<string, unknown>;

// Callers pass content already made safe by normalizeSections; this keeps one malformed
// block from breaking the page if one slips through. Indexes are kept, since Sub-task
// toggles address blocks and Sub-tasks by position.
const toRenderableContent = (content: unknown): ChecklistItemContent => {
  const record: LooseRecord = typeof content === 'object' && content !== null ? (content as LooseRecord) : {};
  return {
    ...record,
    value: typeof record.value === 'string' ? record.value : '',
    fileName: typeof record.fileName === 'string' ? record.fileName : undefined,
    subItems: Array.isArray(record.subItems)
      ? record.subItems.map((subItem: unknown) => {
          const entry: LooseRecord = typeof subItem === 'object' && subItem !== null ? (subItem as LooseRecord) : {};
          return { ...entry, title: typeof entry.title === 'string' ? entry.title : '' } as ChecklistSubItem;
        })
      : undefined,
  } as ChecklistItemContent;
};

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
      {contents.map((rawContent, contentIndex: number) => {
        const content = toRenderableContent(rawContent);
        return (
        <div key={contentIndex} className="space-y-3">
          {content.type === "text" && content.value && (
            <MarkdownBlock value={content.value} />
          )}
          
          {content.type === "image" && content.value && (
            <div className="rounded-lg border overflow-hidden">
              <TaskImage url={content.value} />
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
                  <p className="font-medium">{fileLabel(content) || "File"}</p>
                  <a 
                    href={safeUrl(content.value)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    aria-label={`Download ${fileLabel(content) || "file"}`}
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
              {getEmbedLinkUrl(content.value) ? (
                <a 
                  href={getEmbedLinkUrl(content.value)} 
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
                      aria-label={getSubItemDisplayTitle(subItem, subItemIndex)}
                      checked={!!subItem.isCompleted}
                      disabled={disabled || !onSubItemToggle}
                      className={disabled || !onSubItemToggle ? "opacity-50" : ""}
                      onCheckedChange={() =>
                        onSubItemToggle?.(contentIndex, subItemIndex, !subItem.isCompleted)
                      }
                    />
                    <span className={subItem.isCompleted ? "line-through text-muted-foreground" : ""}>{getSubItemDisplayTitle(subItem, subItemIndex)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
};
