import { Check, ChevronRight, Circle } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ChecklistSection, ChecklistItem } from '@/types/checklist';

interface RunProgressSidebarProps {
  sections: ChecklistSection[];
  currentSectionId: string | null;
  currentTaskId: string | null;
  onSelectTask: (sectionId: string, taskId: string) => void;
}

const getSectionProgress = (section: ChecklistSection) => {
  const total = section.items.length;
  const completed = section.items.filter((item) => item.isCompleted).length;

  return {
    completed,
    percentage: total > 0 ? (completed / total) * 100 : 0,
    total,
  };
};

const isTaskCompleted = (item: ChecklistItem) => item.isCompleted === true;

export function RunProgressSidebar({
  sections,
  currentSectionId,
  currentTaskId,
  onSelectTask,
}: RunProgressSidebarProps) {
  const completedTasks = sections.reduce(
    (total, section) => total + section.items.filter((item) => item.isCompleted).length,
    0,
  );
  const totalTasks = sections.reduce((total, section) => total + section.items.length, 0);
  const overallPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <aside className="flex h-full min-h-full w-full flex-col border-r border-border bg-card xl:w-64">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Progress
        </h2>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
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
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-success">
                        <Check className="h-2.5 w-2.5 text-success-foreground" />
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
                    {section.title}
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
                                  isActive ? 'bg-primary-foreground' : 'bg-success',
                                )}
                              >
                                <Check
                                  className={cn(
                                    'h-2 w-2',
                                    isActive ? 'text-primary' : 'text-success-foreground',
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
            className="h-full bg-success transition-all duration-300"
            style={{ width: `${overallPercentage}%` }}
          />
        </div>
      </div>
    </aside>
  );
}
