import type { ReactNode } from 'react';
import { Copy, ListChecks } from 'lucide-react';

import { CtaBanner } from '@/components/layout/CtaBanner';
import { IconTile } from '@/components/layout/IconTile';
import { PageContainer } from '@/components/layout/page-shell';
import { Link } from '@/components/navigation/Link';
import { RunNotesEditor } from '@/components/run-execution/RunNotesEditor';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { isTaskFormBlocking } from '@/features/run-execution/runFormAnswers';
import { getTaskCheckboxLabel } from '@/features/run-execution/taskCheckboxLabel';
import { buildPublicTemplatesPath } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { getSectionDisplayTitle } from '@/lib/utils/checklistSections';
import { formatCount } from '@/lib/utils/pluralize';
import type { ChecklistRun } from '@/types/checklist';

type SectionProgress = {
  completed: number;
  index: number;
  section: ChecklistRun['sections'][number];
  total: number;
};

type SharedRunViewProps = {
  completedTasks: number;
  finishRunButton: ReactNode;
  isRunCompleted: boolean;
  noteDrafts: Record<string, string | undefined>;
  onCopyLink: () => void;
  onNoteDraftChange: (itemId: string, notes: string) => void;
  onSaveNotes: (itemId: string, notes: string) => Promise<boolean>;
  onToggleSubItem: (itemId: string, contentIndex: number, subItemIndex: number, isCompleted: boolean) => void;
  onToggleTask: (itemId: string, isCompleted: boolean) => void;
  progress: number;
  run: ChecklistRun;
  sectionProgress: SectionProgress[];
  totalTasks: number;
};

export function SharedRunView({
  completedTasks,
  finishRunButton,
  isRunCompleted,
  noteDrafts,
  onCopyLink,
  onNoteDraftChange,
  onSaveNotes,
  onToggleSubItem,
  onToggleTask,
  progress,
  run,
  sectionProgress,
  totalTasks,
}: SharedRunViewProps) {
  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background">
        <PageContainer className="flex h-14 items-center justify-between gap-3" width="narrow">
          <div className="flex min-w-0 items-center gap-3">
            <IconTile size="sm">
              <ListChecks />
            </IconTile>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-medium">{run.title}</h1>
              <p className="text-xs text-muted-foreground">Shared run snapshot</p>
            </div>
          </div>
          <Button className="shrink-0" onClick={onCopyLink} size="sm" variant="outline">
            <Copy data-icon="inline-start" />
            Copy Link
          </Button>
        </PageContainer>
      </header>

      <main>
        <PageContainer className="flex flex-col gap-6 py-8" width="narrow">
          <Card>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col items-start gap-2">
                  <Badge variant="secondary">Shared run snapshot</Badge>
                  <h2 className="text-2xl font-semibold tracking-tight wrap-break-word">{run.title}</h2>
                  <Badge variant={isRunCompleted ? 'default' : 'secondary'}>
                    {isRunCompleted ? 'Completed' : 'In Progress'}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    Anyone with this link can tick tasks, add notes and complete this Run.
                  </p>
                </div>
                <div className="shrink-0 rounded-lg bg-muted p-4 sm:min-w-40">
                  <p className="text-xs text-muted-foreground">Run progress</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{progress}%</p>
                  <p className="text-sm text-muted-foreground">
                    {completedTasks} of {formatCount(totalTasks, 'task')}
                  </p>
                </div>
              </div>
              <Progress aria-label="Run progress" value={progress} />
              {finishRunButton ? <div>{finishRunButton}</div> : null}
            </CardContent>
          </Card>

          {sectionProgress.map(({ completed, index, section, total }) => (
            <Card key={section.id} className="gap-0 py-0">
              <section>
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                  <h2 className="min-w-0 font-medium wrap-break-word">
                    {getSectionDisplayTitle(section, index)}
                  </h2>
                  <Badge variant="secondary">{completed === total ? 'Complete' : `${completed}/${total}`}</Badge>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  {section.items.map((item, itemIndex) => {
                    const waitsForForm = !isRunCompleted && item.isCompleted !== true && isTaskFormBlocking(item);
                    const formNoteId = `shared-form-note-${index}-${itemIndex}`;
                    return (
                      <div key={item.id} className="rounded-lg border">
                        <div className="flex items-start gap-3 p-4">
                          <Checkbox
                            aria-describedby={waitsForForm ? formNoteId : undefined}
                            aria-label={getTaskCheckboxLabel(item.title, itemIndex + 1)}
                            checked={item.isCompleted}
                            className="mt-0.5"
                            disabled={isRunCompleted || waitsForForm}
                            onCheckedChange={(checked) => onToggleTask(item.id, checked === true)}
                          />
                          <div className="min-w-0 flex-1">
                            <h3
                              className={cn(
                                'font-medium wrap-break-word',
                                item.isCompleted && 'text-muted-foreground line-through',
                              )}
                            >
                              {item.title}
                            </h3>
                            {item.description ? (
                              <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">
                                {item.description}
                              </p>
                            ) : null}
                            {waitsForForm ? (
                              <p className="mt-2 text-sm text-muted-foreground" id={formNoteId}>
                                This task can be ticked once its form is answered.
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {item.contents && item.contents.length > 0 ? (
                          <div className="border-t p-4">
                            <ContentRenderer
                              contents={item.contents}
                              disabled={isRunCompleted}
                              onSubItemToggle={(contentIndex, subItemIndex, isCompleted) =>
                                onToggleSubItem(item.id, contentIndex, subItemIndex, isCompleted)
                              }
                            />
                          </div>
                        ) : null}
                        <div className="border-t p-4">
                          <RunNotesEditor
                            draft={noteDrafts[item.id]}
                            label="Task notes"
                            onDraftChange={(notes) => onNoteDraftChange(item.id, notes)}
                            onSave={(notes) => onSaveNotes(item.id, notes)}
                            savedValue={item.notes}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </Card>
          ))}

          <CtaBanner
            actions={
              <Link href={buildPublicTemplatesPath()} className={buttonVariants()}>
                Browse the Template Library
              </Link>
            }
            description="Browse public templates and start a fresh run from a template that matches your workflow."
            title="Want to run your own checklist?"
            titleAs="h2"
          />
        </PageContainer>
      </main>
    </>
  );
}
