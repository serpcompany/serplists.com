import { Check, ChevronRight, Circle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { countRunTasks, getSectionDisplayTitle } from '@/lib/utils/checklistSections';
import type { ChecklistSection, ChecklistItem } from '@/types/checklist';

interface RunProgressPanelProps {
  // The run's overall progress (tasks and sub-tasks), the same percentage as the header.
  progress: number;
  sections: ChecklistSection[];
  currentSectionId: string | null;
  currentTaskId: string | null;
  onSelectTask: (sectionId: string, taskId: string) => void;
}

interface RunTaskListProps extends RunProgressPanelProps {
  // Names the task list landmark (the desktop panel and the mobile sheet each have one).
  label: string;
}

const getSectionProgress = (section: ChecklistSection) => {
  const { tasksCompleted, tasksTotal } = countRunTasks([section]);
  return { completed: tasksCompleted, total: tasksTotal };
};

const isTaskCompleted = (item: ChecklistItem) => item.isCompleted === true;

// Every task of the run, grouped by section, with overall progress. It has no visibility
// classes: the desktop panel shows it as a column and, below xl, the run page shows it in
// a sheet (MobileRunProgress), so both widths can jump to any task.
export function RunTaskList({
  sections,
  currentSectionId,
  currentTaskId,
  label,
  onSelectTask,
  progress,
}: RunTaskListProps) {
  // Counts tasks only, like "Task N of M"; the bar shows the overall progress.
  const { tasksCompleted: completedTasks, tasksTotal: totalTasks } = countRunTasks(sections);

  return (
    <>
      <nav aria-label={label} className="flex-1 overflow-y-auto p-2">
        {totalTasks === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">This run has no tasks.</p>
        ) : null}
        <ul className="space-y-1">
          {sections.map((section, sectionIndex) => {
            const progress = getSectionProgress(section);
            const isSectionActive = section.id === currentSectionId;
            const isSectionComplete =
              progress.completed === progress.total && progress.total > 0;

            return (
              <li key={section.id}>
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5',
                    isSectionActive && 'bg-secondary',
                  )}
                >
                  <div className="flex h-5 w-5 items-center justify-center">
                    {isSectionComplete ? (
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        {sectionIndex + 1}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'flex-1 truncate text-sm',
                      isSectionActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {getSectionDisplayTitle(section, sectionIndex)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {progress.completed}/{progress.total}
                  </span>
                </div>

                <ul className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
                  {section.items.map((item) => {
                    const isActive = item.id === currentTaskId;
                    const isComplete = isTaskCompleted(item);

                    return (
                      <li key={item.id}>
                        <button
                          aria-current={isActive ? 'step' : undefined}
                          onClick={() => onSelectTask(section.id, item.id)}
                          className={cn(
                            'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                            isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
                          )}
                          type="button"
                        >
                          <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                            {isComplete ? (
                              <div
                                className={cn(
                                  'flex h-3.5 w-3.5 items-center justify-center rounded-full',
                                  isActive ? 'bg-primary-foreground' : 'bg-primary',
                                )}
                              >
                                <Check
                                  className={cn(
                                    'h-2 w-2',
                                    isActive ? 'text-primary' : 'text-primary-foreground',
                                  )}
                                />
                              </div>
                            ) : (
                              <Circle
                                className={cn(
                                  'h-3 w-3',
                                  isActive ? 'text-primary-foreground/70' : 'text-muted-foreground/50',
                                )}
                              />
                            )}
                          </div>
                          <span
                            className={cn(
                              'flex-1 truncate text-sm',
                              isComplete && !isActive && 'line-through text-muted-foreground',
                            )}
                          >
                            {item.title}
                          </span>
                          {isComplete ? <span className="sr-only">(completed)</span> : null}
                          {isActive ? (
                            <ChevronRight className="h-3 w-3 text-primary-foreground/70" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Overall Progress</span>
          <span className="font-medium text-foreground">
            {completedTasks} / {totalTasks} tasks
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </>
  );
}

// The run page's right-hand column at xl and wider.
export function RunProgressPanel(props: RunProgressPanelProps) {
  return (
    <section
      className="hidden h-full min-h-full w-full flex-col border-l border-border bg-card xl:flex"
      data-run-progress-panel="true"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Progress
        </h2>
      </div>
      <RunTaskList {...props} label="Run tasks" />
    </section>
  );
}
