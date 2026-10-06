import type { ReactNode } from 'react';

import { DashboardPageBody } from '@/components/dashboard/DashboardContentShell';
import { MobileRunProgress } from '@/components/run-execution/MobileRunProgress';
import { RunProgressPanel } from '@/components/run-execution/RunProgressSidebar';
import { TaskExecutionPanel } from '@/components/run-execution/TaskExecutionPanel';
import type { NoteDrafts } from '@/features/run-execution/noteDrafts';
import { getPrimaryTaskAction } from '@/features/run-execution/primaryTaskAction';
import type { ChecklistRun } from '@/types/checklist';

type RunWorkspaceProps = {
  canUpdateRun: boolean;
  children?: ReactNode;
  completedTasks: number;
  noteDrafts: NoteDrafts;
  onFinishRun: () => void;
  onNoteDraftChange: (itemId: string, notes: string) => void;
  onSaveNotes: (itemId: string, notes: string) => Promise<boolean>;
  onSelectTask: (itemId: string) => void;
  onToggleSubItem: (itemId: string, contentIndex: number, subItemIndex: number, isCompleted: boolean) => void;
  onToggleTask: (itemId: string, isCompleted: boolean) => void;
  progress: number;
  run: ChecklistRun;
  selectedItemId: string | null;
  totalTasks: number;
};

const listTasksInOrder = (run: ChecklistRun) =>
  run.sections.flatMap((section, sectionIndex) =>
    section.items.map((item, itemIndex) => ({
      item,
      itemIndex,
      section,
      sectionIndex,
      totalItemsInSection: section.items.length,
    })),
  );

export function RunWorkspace({
  canUpdateRun,
  children,
  completedTasks,
  noteDrafts,
  onFinishRun,
  onNoteDraftChange,
  onSaveNotes,
  onSelectTask,
  onToggleSubItem,
  onToggleTask,
  progress,
  run,
  selectedItemId,
  totalTasks,
}: RunWorkspaceProps) {
  const activeItemId = selectedItemId ?? run.sections[0]?.items[0]?.id ?? null;
  const tasks = listTasksInOrder(run);
  const selectedIndex = tasks.findIndex((entry) => entry.item.id === activeItemId);
  const selectedEntry = selectedIndex >= 0 ? tasks[selectedIndex] : null;
  const currentSectionId = selectedEntry?.section.id ?? null;
  const previousEntry = selectedIndex > 0 ? tasks[selectedIndex - 1] : null;
  const nextEntry = selectedIndex >= 0 && selectedIndex < tasks.length - 1 ? tasks[selectedIndex + 1] : null;

  return (
    <DashboardPageBody className="overflow-clip">
      <MobileRunProgress
        completedTasks={completedTasks}
        currentSectionId={currentSectionId}
        currentTaskId={activeItemId}
        onSelectTask={(_, taskId) => onSelectTask(taskId)}
        position={selectedEntry ? { index: selectedIndex, total: tasks.length } : null}
        progress={progress}
        sections={run.sections}
        totalTasks={totalTasks}
      />

      <div
        className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"
        data-run-workspace-shell="true"
      >
        <div className="flex min-w-0 flex-col gap-6">
          {selectedEntry ? (
            <TaskExecutionPanel
              section={selectedEntry.section}
              sectionIndex={selectedEntry.sectionIndex}
              task={selectedEntry.item}
              taskIndex={selectedEntry.itemIndex}
              totalTasks={selectedEntry.totalItemsInSection}
              onNavigateNext={() => {
                if (nextEntry) {
                  onSelectTask(nextEntry.item.id);
                }
              }}
              onNavigatePrev={() => {
                if (previousEntry) {
                  onSelectTask(previousEntry.item.id);
                }
              }}
              onToggleSubItem={(contentIndex, subItemIndex, isCompleted) =>
                onToggleSubItem(selectedEntry.item.id, contentIndex, subItemIndex, isCompleted)
              }
              onToggleTask={(isCompleted) => onToggleTask(selectedEntry.item.id, isCompleted)}
              notesDraft={noteDrafts[selectedEntry.item.id]}
              onNotesDraftChange={(notes) => onNoteDraftChange(selectedEntry.item.id, notes)}
              onSaveNotes={(notes) => onSaveNotes(selectedEntry.item.id, notes)}
              hasNext={Boolean(nextEntry)}
              hasPrev={Boolean(previousEntry)}
              primaryAction={getPrimaryTaskAction(run, selectedEntry.item.id, Boolean(nextEntry), canUpdateRun)}
              readOnly={!canUpdateRun}
              runCompleted={run.status === 'completed'}
              onFinishRun={onFinishRun}
              onSelectTask={onSelectTask}
            />
          ) : (
            <p className="py-16 text-center text-muted-foreground">
              Select a task to continue.
            </p>
          )}
          {children}
        </div>
        <RunProgressPanel
          progress={progress}
          sections={run.sections}
          currentSectionId={currentSectionId}
          currentTaskId={activeItemId}
          onSelectTask={(_, taskId) => onSelectTask(taskId)}
        />
      </div>
    </DashboardPageBody>
  );
}
