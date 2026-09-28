import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { normalizeDisplayText } from '@/lib/utils/markdownDisplay';
import type { ChecklistItem, ChecklistSection } from '@/types/checklist';
import { RunNotesEditor } from '@/components/run-execution/RunNotesEditor';
import {
  getPrimaryTaskButton,
  type PrimaryTaskAction,
} from '@/features/run-execution/primaryTaskAction';

interface TaskExecutionPanelProps {
  section: ChecklistSection;
  task: ChecklistItem;
  taskIndex: number;
  totalTasks: number;
  onFinishRun: () => void;
  onNavigateNext: () => void;
  onNavigatePrev: () => void;
  onSelectTask: (itemId: string) => void;
  onToggleSubItem: (contentIndex: number, subItemIndex: number) => void;
  onToggleTask: () => void;
  onSaveNotes: (notes: string) => Promise<boolean>;
  hasNext: boolean;
  hasPrev: boolean;
  primaryAction: PrimaryTaskAction;
}

export function TaskExecutionPanel({
  section,
  task,
  taskIndex,
  totalTasks,
  onFinishRun,
  onNavigateNext,
  onNavigatePrev,
  onSelectTask,
  onToggleSubItem,
  onToggleTask,
  onSaveNotes,
  hasNext,
  hasPrev,
  primaryAction,
}: TaskExecutionPanelProps) {
  const isTaskComplete = task.isCompleted === true;
  const primaryButton = getPrimaryTaskButton(primaryAction, {
    onFinishRun,
    onNavigateNext,
    onSelectTask,
    onToggleTask,
  });

  return (
    <div className="flex h-full min-h-full flex-col">
      <div className="border-b border-border bg-card px-8 py-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{section.title}</span>
            <span>/</span>
            <span>
              Task {taskIndex + 1} of {totalTasks}
            </span>
          </div>

          <div className="flex items-start gap-4">
            <button
              onClick={onToggleTask}
              className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
              type="button"
            >
              {isTaskComplete ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-md border-success bg-success text-success-foreground">
                  <Check className="h-4 w-4" />
                </span>
              ) : (
                <span className="h-6 w-6 rounded-md border-2 border-muted-foreground/30" />
              )}
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-foreground">
                {task.title}
              </h2>
              {task.description ? (
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {normalizeDisplayText(task.description)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {task.contents?.length ? (
            <ContentRenderer
              contents={task.contents}
              disabled={false}
              onSubItemToggle={onToggleSubItem}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Checkbox checked={false} disabled className="mb-3 h-5 w-5" />
              <p className="text-sm text-muted-foreground">
                No additional content for this task
              </p>
            </div>
          )}
          <RunNotesEditor
            initialValue={task.notes}
            key={task.id}
            label="Task notes"
            onSave={onSaveNotes}
          />
        </div>
      </div>

      <div className="border-t border-border bg-card px-8 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Button
            variant="outline"
            onClick={onNavigatePrev}
            disabled={!hasPrev}
            className="gap-2"
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <Button
            onClick={primaryButton.onClick}
            disabled={primaryButton.disabled}
            className="gap-2"
            type="button"
          >
            {primaryButton.icon === 'check' ? <Check className="h-4 w-4" /> : null}
            {primaryButton.label}
            {primaryButton.icon === 'next' ? <ChevronRight className="h-4 w-4" /> : null}
          </Button>

          <Button
            variant="outline"
            onClick={onNavigateNext}
            disabled={!hasNext}
            className="gap-2"
            type="button"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
