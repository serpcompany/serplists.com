import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { Button } from '@/components/ui/button';
import { getSectionDisplayTitle } from '@/lib/utils/checklistSections';
import { onSingleClick } from '@/lib/utils/repeatClick';
import { cn } from '@/lib/utils';
import type { ChecklistItem, ChecklistSection } from '@/types/checklist';
import { RunNotesEditor } from '@/components/run-execution/RunNotesEditor';
import { TaskHeaderReveal } from '@/components/run-execution/TaskHeaderReveal';
import {
  getPrimaryTaskButton,
  type PrimaryTaskAction,
} from '@/features/run-execution/primaryTaskAction';
import { getTaskCheckboxLabel } from '@/features/run-execution/taskCheckboxLabel';

interface TaskExecutionPanelProps {
  section: ChecklistSection;
  sectionIndex: number;
  task: ChecklistItem;
  taskIndex: number;
  totalTasks: number;
  onFinishRun: () => void;
  onNavigateNext: () => void;
  onNavigatePrev: () => void;
  onSelectTask: (itemId: string) => void;
  onToggleSubItem: (contentIndex: number, subItemIndex: number, isCompleted: boolean) => void;
  onToggleTask: (isCompleted: boolean) => void;
  notesDraft?: string | undefined;
  onNotesDraftChange: (notes: string) => void;
  onSaveNotes: (notes: string) => Promise<boolean>;
  hasNext: boolean;
  hasPrev: boolean;
  primaryAction: PrimaryTaskAction;
  readOnly?: boolean;
  runCompleted?: boolean;
}

export function TaskExecutionPanel({
  section,
  sectionIndex,
  task,
  taskIndex,
  totalTasks,
  onFinishRun,
  onNavigateNext,
  onNavigatePrev,
  onSelectTask,
  onToggleSubItem,
  onToggleTask,
  notesDraft,
  onNotesDraftChange,
  onSaveNotes,
  hasNext,
  hasPrev,
  primaryAction,
  readOnly = false,
  runCompleted = false,
}: TaskExecutionPanelProps) {
  const isTaskComplete = task.isCompleted === true;
  const canTick = !readOnly && !runCompleted;
  const primaryButton = getPrimaryTaskButton(primaryAction, {
    onCompleteTask: () => onToggleTask(true),
    onFinishRun,
    onNavigateNext,
    onSelectTask,
  });

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col overflow-clip rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
      <TaskHeaderReveal className="border-b px-4 py-5 sm:px-6" taskId={task.id}>
        <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="wrap-anywhere">{getSectionDisplayTitle(section, sectionIndex)}</span>
          <span aria-hidden="true">/</span>
          <span>
            Task {taskIndex + 1} of {totalTasks}
          </span>
        </p>

        <div className="flex items-start gap-3">
          <button
            aria-checked={isTaskComplete}
            aria-label={getTaskCheckboxLabel(task.title, taskIndex + 1)}
            disabled={!canTick}
            onClick={onSingleClick(() => onToggleTask(!isTaskComplete))}
            className={cn(
              'mt-1 flex size-6 shrink-0 items-center justify-center rounded-md border border-input transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
              isTaskComplete && 'border-primary bg-primary text-primary-foreground',
            )}
            role="checkbox"
            type="button"
          >
            {isTaskComplete ? <Check aria-hidden="true" className="size-4" /> : null}
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight wrap-break-word focus:outline-hidden" tabIndex={-1}>
              {task.title}
            </h2>
            {task.description ? (
              <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
                {task.description}
              </p>
            ) : null}
          </div>
        </div>
      </TaskHeaderReveal>

      <div className="flex flex-1 flex-col gap-6 px-4 py-5 sm:px-6">
        {task.contents?.length ? (
          <ContentRenderer
            key={`contents-${task.id}`}
            contents={task.contents}
            disabled={!canTick}
            onSubItemToggle={onToggleSubItem}
            subtaskHeadingAs="h3"
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No additional content for this task
          </p>
        )}
        <RunNotesEditor
          draft={notesDraft}
          key={task.id}
          label="Task notes"
          onDraftChange={onNotesDraftChange}
          onSave={onSaveNotes}
          readOnly={readOnly}
          savedValue={task.notes}
        />
      </div>

      <div
        className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t bg-card px-4 py-3 sm:px-6"
        data-task-footer="true"
      >
        <Button
          variant="outline"
          onClick={onNavigatePrev}
          disabled={!hasPrev}
          type="button"
        >
          <ChevronLeft />
          <span className="sr-only sm:not-sr-only">Previous</span>
        </Button>

        <Button
          onClick={primaryButton.onClick && onSingleClick(primaryButton.onClick)}
          disabled={primaryButton.disabled}
          className="min-w-0 shrink"
          type="button"
        >
          {primaryButton.icon === 'check' ? <Check data-icon="inline-start" /> : null}
          {primaryButton.label}
          {primaryButton.icon === 'next' ? <ChevronRight data-icon="inline-end" /> : null}
        </Button>

        <Button
          variant="outline"
          onClick={onNavigateNext}
          disabled={!hasNext}
          type="button"
        >
          <span className="sr-only sm:not-sr-only">Next</span>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
