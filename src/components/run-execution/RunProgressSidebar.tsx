import { Check, Circle } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { countRunTasks, getSectionDisplayTitle } from '@/lib/utils/checklistSections';
import { formatCount } from '@/lib/utils/pluralize';
import type { ChecklistSection, ChecklistItem } from '@/types/checklist';

interface RunProgressPanelProps {
  progress: number;
  sections: ChecklistSection[];
  currentSectionId: string | null;
  currentTaskId: string | null;
  onSelectTask: (sectionId: string, taskId: string) => void;
}

interface RunTaskListProps extends RunProgressPanelProps {
  label: string;
}

const getSectionProgress = (section: ChecklistSection) => {
  const { tasksCompleted, tasksTotal } = countRunTasks([section]);
  return { completed: tasksCompleted, total: tasksTotal };
};

const isTaskCompleted = (item: ChecklistItem) => item.isCompleted === true;

export function RunTaskList({
  sections,
  currentSectionId,
  currentTaskId,
  label,
  onSelectTask,
  progress,
}: RunTaskListProps) {
  const { tasksCompleted: completedTasks, tasksTotal: totalTasks } = countRunTasks(sections);

  return (
    <>
      <nav aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-2">
        {totalTasks === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">This run has no tasks.</p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {sections.map((section, sectionIndex) => {
            const progress = getSectionProgress(section);
            const isSectionActive = section.id === currentSectionId;
            const isSectionComplete =
              progress.completed === progress.total && progress.total > 0;

            return (
              <li key={section.id}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="flex size-5 shrink-0 items-center justify-center">
                    {isSectionComplete ? (
                      <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check aria-hidden="true" className="size-2.5" />
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">{sectionIndex + 1}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      isSectionActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {getSectionDisplayTitle(section, sectionIndex)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {progress.completed}/{progress.total}
                  </span>
                </div>

                <ul className="mt-1 ml-4 flex flex-col gap-0.5 border-l pl-2">
                  {section.items.map((item) => {
                    const isActive = item.id === currentTaskId;
                    const isComplete = isTaskCompleted(item);

                    return (
                      <li key={item.id}>
                        <button
                          aria-current={isActive ? 'step' : undefined}
                          onClick={() => onSelectTask(section.id, item.id)}
                          className={cn(
                            'flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                            isActive && 'bg-muted font-medium',
                          )}
                          type="button"
                        >
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            {isComplete ? (
                              <span className="flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check aria-hidden="true" className="size-2" />
                              </span>
                            ) : (
                              <Circle aria-hidden="true" className="size-3 text-muted-foreground" />
                            )}
                          </span>
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate',
                              isComplete && !isActive && 'text-muted-foreground line-through',
                            )}
                          >
                            {item.title}
                          </span>
                          {isComplete ? <span className="sr-only">(completed)</span> : null}
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

      <div className="flex flex-col gap-2 border-t p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Overall Progress</span>
          <span className="font-medium">
            {completedTasks} / {formatCount(totalTasks, 'task')}
          </span>
        </div>
        <Progress aria-label="Overall Progress" value={progress} />
      </div>
    </>
  );
}

export function RunProgressPanel(props: RunProgressPanelProps) {
  return (
    <section
      className="hidden overflow-clip rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:flex-col xl:flex"
      data-run-progress-panel="true"
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-medium">Progress</h2>
      </div>
      <RunTaskList {...props} label="Run tasks" />
    </section>
  );
}
