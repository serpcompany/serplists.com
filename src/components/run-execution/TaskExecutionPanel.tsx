import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { Button } from '@/components/ui/button';
import { getSectionDisplayTitle } from '@/lib/utils/checklistSections';
import { onSingleClick } from '@/lib/utils/repeatClick';
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
    // At least as tall as the window, whatever the Changelog under it holds, so the footer
    // below starts past the bottom of the window and stays pinned there.
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      {/* This panel stays mounted while the task inside it changes, and the window is what
          scrolls: moving to another task scrolls its header into view and focuses the title. */}
      <TaskHeaderReveal className="border-b border-border bg-card px-8 py-6" taskId={task.id}>
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{getSectionDisplayTitle(section, sectionIndex)}</span>
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
              className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              role="checkbox"
              type="button"
            >
              {isTaskComplete ? (
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 items-center justify-center rounded-md border-primary bg-primary text-primary-foreground"
                >
                  <Check className="h-4 w-4" />
                </span>
              ) : (
                <span aria-hidden="true" className="h-6 w-6 rounded-md border-2 border-muted-foreground/30" />
              )}
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-foreground focus:outline-hidden" tabIndex={-1}>
                {task.title}
              </h2>
              {task.description ? (
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {task.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </TaskHeaderReveal>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {task.contents?.length ? (
            // Keyed per task: blocks are keyed by position, so the next task's blocks would
            // otherwise reuse this task's elements (and a video player its file). The key
            // differs from the notes editor's, its sibling.
            <ContentRenderer
              key={`contents-${task.id}`}
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

      {/* Pinned to the bottom of the window (above the phone navigation bar) until the end
          of the panel scrolls into view, so Mark Complete is in view on a short task and never
          moves when the Changelog under the panel grows after a save. The page must not wrap
          it in a scroll container (ChecklistRun.tsx). */}
      <div
        className="sticky bottom-16 z-10 border-t border-border bg-card px-8 py-4 md:bottom-0"
        data-task-footer="true"
      >
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
