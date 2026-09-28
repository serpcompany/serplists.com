import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { Button } from '@/components/ui/button';
import { normalizeDisplayText } from '@/lib/utils/markdownDisplay';
import { onSingleClick } from '@/lib/utils/repeatClick';
import type { ChecklistItem, ChecklistSection } from '@/types/checklist';
import { RunNotesEditor } from '@/components/run-execution/RunNotesEditor';
import {
  getPrimaryTaskButton,
  type PrimaryTaskAction,
} from '@/features/run-execution/primaryTaskAction';
import { getTaskCheckboxLabel } from '@/features/run-execution/taskCheckboxLabel';

interface TaskExecutionPanelProps {
  section: ChecklistSection;
  task: ChecklistItem;
  taskIndex: number;
  totalTasks: number;
  onFinishRun: () => void;
  onNavigateNext: () => void;
  onNavigatePrev: () => void;
  onSelectTask: (itemId: string) => void;
  // isCompleted is the value the user clicked, so a click queued behind a slow save still
  // sets what they saw and chose.
  onToggleSubItem: (contentIndex: number, subItemIndex: number, isCompleted: boolean) => void;
  onToggleTask: (isCompleted: boolean) => void;
  notesDraft?: string;
  onNotesDraftChange: (notes: string) => void;
  onSaveNotes: (notes: string) => Promise<boolean>;
  hasNext: boolean;
  hasPrev: boolean;
  primaryAction: PrimaryTaskAction;
  // Organization members whose role cannot update the run can only read it.
  readOnly?: boolean;
  // A completed run is frozen: its tasks and sub-tasks cannot be ticked or unticked.
  // Notes stay editable, as they do not change completion.
  runCompleted?: boolean;
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
            {/* Completing the task moves on to the next one, so a double click would
                also toggle that task: the second click is ignored. Once the task is done
                the footer button moves on, so this is the only way to untick it: it is a
                named checkbox with its checked state. */}
            <button
              aria-checked={isTaskComplete}
              aria-label={getTaskCheckboxLabel(task.title, taskIndex + 1)}
              disabled={!canTick}
              onClick={onSingleClick(() => onToggleTask(!isTaskComplete))}
              className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              role="checkbox"
              type="button"
            >
              {isTaskComplete ? (
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 items-center justify-center rounded-md border-success bg-success text-success-foreground"
                >
                  <Check className="h-4 w-4" />
                </span>
              ) : (
                <span aria-hidden="true" className="h-6 w-6 rounded-md border-2 border-muted-foreground/30" />
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
              disabled={!canTick}
              onSubItemToggle={onToggleSubItem}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              {/* Decorative: an empty box, not a control. */}
              <span aria-hidden="true" className="mb-3 h-5 w-5 shrink-0 rounded-sm border border-primary opacity-50" />
              <p className="text-sm text-muted-foreground">
                No additional content for this task
              </p>
            </div>
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

          {/* The action changes under the pointer (Next Task shows the next, open task,
              whose button reads Mark Complete), so the second click of a double click is
              ignored. */}
          <Button
            onClick={primaryButton.onClick && onSingleClick(primaryButton.onClick)}
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
