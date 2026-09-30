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

// The run page's task: its place in the run, a checkbox and the task's title and description,
// its content blocks and notes, and a footer (Previous, the primary action, Next) that stays at
// the bottom of the window. A bordered panel in the theme's card colors.
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
    // below starts past the bottom of the window and stays pinned there. It clips rather
    // than hides its overflow: a scroll container would hold the sticky footer to itself.
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col overflow-clip rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
      {/* This panel stays mounted while the task inside it changes, and the window is what
          scrolls: moving to another task scrolls its header into view and focuses the title. */}
      <TaskHeaderReveal className="border-b px-4 py-5 sm:px-6" taskId={task.id}>
        <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="wrap-anywhere">{getSectionDisplayTitle(section, sectionIndex)}</span>
          <span aria-hidden="true">/</span>
          <span>
            Task {taskIndex + 1} of {totalTasks}
          </span>
        </p>

        <div className="flex items-start gap-3">
          {/* Completing the task moves on to the next one, so a double click would
              also toggle that task: the second click is ignored. Once the task is done
              the footer button moves on, so this is the only way to untick it: it is a
              named checkbox with its checked state. */}
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
          // Keyed per task: blocks are keyed by position, so the next task's blocks would
          // otherwise reuse this task's elements (and a video player its file). The key
          // differs from the notes editor's, its sibling.
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

      {/* Pinned to the bottom of the window until the end of the panel scrolls into view, so
          Mark Complete is in view on a short task and never moves when the Changelog under
          the panel grows after a save. The page must not wrap it in a scroll container
          (ChecklistRun.tsx). On a phone, Previous and Next show only their arrows. */}
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

        {/* The action changes under the pointer (Next Task shows the next, open task,
            whose button reads Mark Complete), so the second click of a double click is
            ignored. */}
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
