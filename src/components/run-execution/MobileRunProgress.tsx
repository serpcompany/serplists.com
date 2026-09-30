import { ListChecks } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { RunTaskList } from '@/components/run-execution/RunProgressSidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { formatCount } from '@/lib/utils/pluralize';
import type { ChecklistSection } from '@/types/checklist';

// Tailwind's xl breakpoint, where the desktop progress panel (RunProgressPanel) takes over.
const DESKTOP_QUERY = '(min-width: 1280px)';

interface MobileRunProgressProps {
  completedTasks: number;
  currentSectionId: string | null;
  currentTaskId: string | null;
  onSelectTask: (sectionId: string, taskId: string) => void;
  // The selected task's place in the run, or null when none is selected.
  position: { index: number; total: number } | null;
  progress: number;
  sections: ChecklistSection[];
  totalTasks: number;
}

// Run progress below xl, where the desktop panel is hidden: the summary, and a Tasks button
// that opens every task in a sheet so any task can be opened directly.
export function MobileRunProgress({
  completedTasks,
  currentSectionId,
  currentTaskId,
  onSelectTask,
  position,
  progress,
  sections,
  totalTasks,
}: MobileRunProgressProps) {
  const [isTaskListOpen, setIsTaskListOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // A sheet left open while the window grows to xl would sit over the desktop panel.
  useEffect(() => {
    if (!isTaskListOpen || typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const closeOnDesktop = () => {
      if (desktop.matches) setIsTaskListOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, [isTaskListOpen]);

  return (
    <section
      className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 xl:hidden"
      data-mobile-run-progress="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <p className="font-medium">{progress}% complete</p>
          <p className="text-xs text-muted-foreground">
            {completedTasks} of {formatCount(totalTasks, 'task')} finished
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {position ? (
            <Badge variant="secondary">
              Task {position.index + 1} of {position.total}
            </Badge>
          ) : null}
          <Sheet open={isTaskListOpen} onOpenChange={setIsTaskListOpen}>
            <SheetTrigger
              render={<Button data-mobile-run-tasks-trigger="true" size="sm" type="button" variant="outline" />}
            >
              <ListChecks data-icon="inline-start" />
              Tasks
            </SheetTrigger>
            <SheetContent
              className="flex max-h-[85dvh] flex-col gap-0 p-0"
              // Start on the current task rather than the top of a long run.
              initialFocus={() =>
                contentRef.current?.querySelector<HTMLElement>('[aria-current="step"]') ?? true
              }
              ref={contentRef}
              side="bottom"
            >
              <SheetHeader className="border-b pr-12">
                <SheetTitle>Tasks</SheetTitle>
                <SheetDescription>Open any task in this run.</SheetDescription>
              </SheetHeader>
              <RunTaskList
                currentSectionId={currentSectionId}
                currentTaskId={currentTaskId}
                label="Run tasks"
                onSelectTask={(sectionId, taskId) => {
                  onSelectTask(sectionId, taskId);
                  setIsTaskListOpen(false);
                }}
                progress={progress}
                sections={sections}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <Progress aria-label="Run progress" value={progress} />
    </section>
  );
}
