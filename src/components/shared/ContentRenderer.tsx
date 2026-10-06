import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { MarkdownBlock } from './MarkdownBlock';
import { TaskImage } from './TaskImage';
import { VideoEmbed } from './VideoEmbed';
import { FormFieldInputs } from './FormFieldInputs';
import { FormFieldList } from './FormFieldList';
import { ClipboardList, File, Code, ListCheck } from 'lucide-react';
import { ChecklistFormField, ChecklistItemContent, ChecklistSubItem, FormAnswer } from '@/types/checklist';
import { readFormFields } from '@/lib/schemas/formFields';
import { findFormFieldProblem } from '@/lib/schemas/formValidation';
import { isContentRecord, isSubTaskRecord, type ContentRecord, type SubTaskRecord } from '@/lib/schemas/jsonRecords';
import { getSubItemDisplayTitle } from '@/lib/utils/checklistSections';
import { getEmbedLinkUrl } from '@/lib/utils/embedLink';
import { hasCurrentFileInfo } from '@/lib/utils/mediaSource';
import { safeUrl } from '@/lib/utils/safeUrl';

type RenderableContent = {
  type: unknown;
  value: string;
  uploadType: unknown;
  fileName: string | undefined;
  subItems: ChecklistSubItem[] | undefined;
  fields: ChecklistFormField[];
};

const fileLabel = (content: RenderableContent): string | undefined =>
  hasCurrentFileInfo(content) ? content.fileName : undefined;

const toRenderableSubItem = (subItem: unknown): ChecklistSubItem => {
  const entry: SubTaskRecord = isSubTaskRecord(subItem) ? subItem : {};
  return {
    id: typeof entry.id === 'string' ? entry.id : undefined,
    title: typeof entry.title === 'string' ? entry.title : '',
    isCompleted: Boolean(entry.isCompleted),
  };
};

const toRenderableContent = (content: unknown, contentIndex: number): RenderableContent => {
  const record: ContentRecord = isContentRecord(content) ? content : {};
  return {
    type: record.type,
    value: typeof record.value === 'string' ? record.value : '',
    uploadType: record.uploadType,
    fileName: typeof record.fileName === 'string' ? record.fileName : undefined,
    subItems: Array.isArray(record.subItems) ? record.subItems.map(toRenderableSubItem) : undefined,
    fields: record.type === 'form'
      ? readFormFields(record.fields, (fieldIndex) => `form-${contentIndex + 1}-field-${fieldIndex + 1}`)
      : [],
  };
};

interface ContentRendererProps {
  contents: ChecklistItemContent[];
  disabled?: boolean;
  formCheck?: number;
  onFormAnswerChange?: ((contentIndex: number, fieldId: string, answer: FormAnswer | undefined) => void) | undefined;
  onSubItemToggle?: (contentIndex: number, subItemIndex: number, isCompleted: boolean) => void;
  subtaskHeadingAs?: 'h3' | 'h4';
  uploadLoginPath?: string | undefined;
}

const hasFormProblem = (content: RenderableContent): boolean =>
  content.type === 'form' && content.fields.some((field) => findFormFieldProblem(field) !== null);

export const ContentRenderer: React.FC<ContentRendererProps> = ({ 
  contents, 
  disabled = false,
  formCheck = 0,
  onFormAnswerChange,
  onSubItemToggle,
  subtaskHeadingAs: SubtaskHeading = 'h4',
  uploadLoginPath,
}) => {
  if (!contents || contents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <File className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No additional content for this task</p>
      </div>
    );
  }

  const renderable = contents.map(toRenderableContent);
  const firstFormWithProblem = renderable.findIndex(hasFormProblem);

  return (
    <div className="space-y-6">
      {renderable.map((content, contentIndex: number) => {
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
                <pre className="whitespace-pre-wrap wrap-break-word text-xs text-muted-foreground">
                  {content.value}
                </pre>
              )}
            </div>
          )}
          
          {content.type === "subItems" && content.subItems && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ListCheck className="h-5 w-5 text-muted-foreground" />
                <SubtaskHeading className="font-medium">Sub-tasks</SubtaskHeading>
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

          {content.type === "form" && content.fields.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                <SubtaskHeading className="font-medium">Form</SubtaskHeading>
              </div>
              <div className="sm:pl-7">
                {onFormAnswerChange && !disabled ? (
                  <FormFieldInputs
                    check={formCheck}
                    fields={content.fields}
                    focusOnCheck={contentIndex === firstFormWithProblem}
                    onAnswerChange={(fieldId, answer) => onFormAnswerChange(contentIndex, fieldId, answer)}
                    uploadLoginPath={uploadLoginPath}
                  />
                ) : (
                  <FormFieldList fields={content.fields} />
                )}
              </div>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
};
