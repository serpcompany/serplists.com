import type { JSX } from 'react';
import { Archive, CheckCircle2, Circle } from 'lucide-react';

import type { RetiredRunItem, RetiredRunSubTask, RetiredRunTask } from '@/types/checklist';

// Work a Template change removed from this Run, shown read-only with the completion and
// notes it had. It never counts toward progress.

function CompletionState({ isCompleted }: { isCompleted: boolean }): JSX.Element {
  return isCompleted ? (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-foreground">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      Completed
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <Circle className="h-3.5 w-3.5" aria-hidden="true" />
      Not completed
    </span>
  );
}

function SubTaskList({ subTasks }: { subTasks: RetiredRunSubTask[] }): JSX.Element | null {
  if (subTasks.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 border-l border-border pl-3">
      {subTasks.map((subTask, index) => (
        <li key={`${subTask.id}:${index}`} className="flex items-start justify-between gap-3 text-sm text-foreground">
          <span>{subTask.title || 'Untitled Sub-task'}</span>
          <CompletionState isCompleted={subTask.isCompleted} />
        </li>
      ))}
    </ul>
  );
}

function RetiredTask({ task, context }: { task: RetiredRunTask; context?: string }): JSX.Element {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{task.title || 'Untitled task'}</p>
        <CompletionState isCompleted={task.isCompleted} />
      </div>
      {context ? <p className="text-xs text-muted-foreground">{context}</p> : null}
      {task.notes ? (
        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap wrap-break-word">
          {task.notes}
        </p>
      ) : null}
      <SubTaskList subTasks={task.subTasks} />
    </div>
  );
}

function RetiredEntry({ entry }: { entry: RetiredRunItem }): JSX.Element {
  switch (entry.kind) {
    case 'section':
      return (
        <div>
          <p className="text-sm font-semibold text-foreground">Section: {entry.title || 'Untitled section'}</p>
          <div className="mt-2 space-y-3 border-l border-border pl-3">
            {entry.tasks.map((task, index) => (
              <RetiredTask key={`${task.id}:${index}`} task={task} />
            ))}
          </div>
        </div>
      );
    case 'item':
      return <RetiredTask task={entry.task} context={entry.sectionTitle ? `In ${entry.sectionTitle}` : undefined} />;
    case 'subItem':
      return (
        <div>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground">{entry.subTask.title || 'Untitled Sub-task'}</p>
            <CompletionState isCompleted={entry.subTask.isCompleted} />
          </div>
          <p className="text-xs text-muted-foreground">
            {entry.itemTitle ? `Sub-task of ${entry.itemTitle}` : 'Sub-task'}
          </p>
        </div>
      );
    default: {
      const unreachable: never = entry;
      return unreachable;
    }
  }
}

export function RetiredRunItems({ items }: { items: RetiredRunItem[] }): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <section
      className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10"
      data-retired-run-items="true"
    >
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Archive className="size-4 text-muted-foreground" aria-hidden="true" />
          Removed from Template ({items.length})
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          The Template no longer includes this work. It is kept here read-only, with its completion
          and notes, and does not count toward progress.
        </p>
        <div className="mt-4 divide-y">
          {items.map((entry, index) => (
            <div key={`${entry.kind}:${entry.id}:${index}`} className="py-3 first:pt-0 last:pb-0">
              <RetiredEntry entry={entry} />
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
