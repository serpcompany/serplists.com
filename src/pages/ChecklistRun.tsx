import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  CheckCircle,
  Copy,
  Edit2,
  History,
  Loader2,
  ListChecks,
  Share2,
} from 'lucide-react';

import { PageContainer, Surface } from '@/components/layout/page-shell';
import {
  DashboardContentShell,
  DashboardPageHeader,
  DashboardScrollArea,
} from '@/components/dashboard/DashboardContentShell';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { SEOHead } from '@/components/shared/SEOHead';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RunProgressPanel } from '@/components/run-execution/RunProgressSidebar';
import { TaskExecutionPanel } from '@/components/run-execution/TaskExecutionPanel';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useRunExecutionModel } from '@/features/run-execution/useRunExecutionModel';
import { cn } from '@/lib/utils';
import {
  buildConsoleHomePath,
  buildConsoleRunsPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { normalizeDisplayText } from '@/lib/utils/markdownDisplay';
import type { TemplateHistoryEvent } from '@/lib/api';
import { RunNotesEditor } from '@/components/run-execution/RunNotesEditor';

const runHistoryActionLabels: Record<string, string> = {
  'checklist_run.created': 'Created run',
  'checklist_run.updated': 'Updated run',
  'checklist_run.deleted': 'Archived run',
};

const formatRunHistoryAction = (action: string): string =>
  runHistoryActionLabels[action] ?? action;

const formatRunHistoryTime = (value?: string): string => {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const getRunHistoryActorName = (
  actor?: TemplateHistoryEvent['actor'],
): string => actor?.name || actor?.username || actor?.email || 'Unknown user';

const ChecklistRunPage = () => {
  const { id, shareToken } = useParams<{ id?: string; shareToken?: string }>();
  const navigate = useNavigate();
  const { getRun, updateRun } = useTemplates();
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [isCreatingShare, setIsCreatingShare] = useState(false);

  const {
    counts,
    createShare,
    history,
    isSharedRun,
    loadError,
    loading,
    notFound,
    progress,
    run,
    saveItemNotes,
    saveTitle,
    selectedData,
    selectedItemId,
    setSelectedItemId,
    completeRun,
    toggleItem,
    toggleSubItem,
  } = useRunExecutionModel({
    getCachedRun: getRun,
    runId: id,
    shareToken,
    updateRun,
  });
  const displayRun = run;
  const displayProgress = displayRun?.progress ?? progress;

  useEffect(() => {
    if (!notFound || loading) {
      return;
    }

    toast.error('Run not found');
    navigate(
      isSharedRun ? buildPublicTemplatesPath() : buildConsoleHomePath(),
      { replace: true },
    );
  }, [isSharedRun, loading, navigate, notFound]);

  useEffect(() => {
    if (!loadError) {
      return;
    }

    toast.error(loadError);
  }, [loadError]);

  const handleBack = () =>
    navigate(isSharedRun ? buildPublicTemplatesPath() : buildConsoleRunsPath());

  const handleItemToggle = async (itemId: string) => {
    const result = await toggleItem(itemId);

    if (result.kind === 'ok') {
      if (result.shouldPromptComplete) {
        setIsCompleteDialogOpen(true);
      }
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message || 'Unable to save your progress. Please try again.');
    }
  };

  const handleSubItemToggle = async (
    itemId: string,
    contentIndex: number,
    subItemIndex: number,
  ) => {
    const result = await toggleSubItem(itemId, contentIndex, subItemIndex);

    if (result.kind === 'ok') {
      if (result.shouldPromptComplete) {
        setIsCompleteDialogOpen(true);
      }
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message || 'Unable to save your progress. Please try again.');
    }
  };

  const handleItemNotesSave = async (itemId: string, notes: string) => {
    const result = await saveItemNotes(itemId, notes);
    if (result.kind === 'ok') return true;
    toast.error(result.kind === 'error' ? result.message : 'Unable to save task notes.');
    return false;
  };

  const handleTitleEdit = () => {
    if (isSharedRun || !displayRun) {
      return;
    }

    setEditTitle(displayRun.title);
    setIsEditingTitle(true);
  };

  const handleTitleSave = async () => {
    if (isSharedRun || !run) {
      return;
    }

    const result = await saveTitle(editTitle);

    if (result.kind === 'ok') {
      setIsEditingTitle(false);
      setEditTitle('');
      toast.success('Run title updated');
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message);
    }
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
    setEditTitle('');
  };

  const handleCreateShare = async () => {
    if (!displayRun) {
      return;
    }

    setIsCreatingShare(true);

    try {
      const result = await createShare();

      if (result.kind === 'ok' && result.shareUrl) {
        await navigator.clipboard.writeText(result.shareUrl);
        toast.success('Share link copied to clipboard');
        return;
      }

      if (result.kind === 'error') {
        toast.error(result.message || 'Failed to create share link for this run.');
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create share link for this run.';
      toast.error(message);
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCopyCurrentLink = async () => {
    if (typeof window === 'undefined') {
      return;
    }

    await navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied to clipboard');
  };

  const handleCompleteRun = async () => {
    const result = await completeRun();

    if (result.kind === 'ok') {
      setIsCompleteDialogOpen(false);
      toast.success('Checklist completed! 🎉');
      handleBack();
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message || 'Unable to save completion. Please try again.');
    }
  };

  if (loading) {
    if (!isSharedRun) {
      return (
        <DashboardContentShell>
          <DashboardScrollArea className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </DashboardScrollArea>
        </DashboardContentShell>
      );
    }

    return (
      <div className="flex h-52 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!displayRun) {
    if (!isSharedRun) {
      return (
        <DashboardContentShell>
          <DashboardScrollArea className="flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold">
                {loadError ? 'Unable to load run' : 'Run not found'}
              </h2>
              {loadError ? (
                <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
              ) : null}
              <Button className="mt-4" onClick={handleBack}>
                Back
              </Button>
            </div>
          </DashboardScrollArea>
        </DashboardContentShell>
      );
    }

    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          {loadError ? 'Unable to load run' : 'Run not found'}
        </h2>
        {loadError ? (
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        ) : null}
        <Button className="mt-4" onClick={handleBack}>
          Back
        </Button>
      </div>
    );
  }

  const activeItemId = selectedItemId ?? displayRun.sections[0]?.items[0]?.id ?? null;
  const flatItems = displayRun.sections.flatMap((section) =>
    section.items.map((item, itemIndex) => ({
      item,
      itemIndex,
      section,
      totalItemsInSection: section.items.length,
    })),
  );
  const selectedIndex = flatItems.findIndex(
    (entry) => entry.item.id === activeItemId,
  );
  const selectedEntry = selectedIndex >= 0 ? flatItems[selectedIndex] : null;
  const previousEntry = selectedIndex > 0 ? flatItems[selectedIndex - 1] : null;
  const nextEntry =
    selectedIndex >= 0 && selectedIndex < flatItems.length - 1
      ? flatItems[selectedIndex + 1]
      : null;

  const sectionProgress = displayRun.sections.map((section, index) => {
    const completed = section.items.filter((item) => item.isCompleted).length;
    return {
      completed,
      index,
      total: section.items.length,
      section,
    };
  });
  const privateRunHeaderActions = (
    <>
      <Button variant="ghost" size="sm" onClick={handleBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Runs
      </Button>
      {!isEditingTitle ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={handleTitleEdit}
        >
          <Edit2 className="mr-2 h-4 w-4" />
          Rename
        </Button>
      ) : (
        <>
          <Button size="sm" onClick={() => void handleTitleSave()}>
            Save title
          </Button>
          <Button size="sm" variant="outline" onClick={handleTitleCancel}>
            Cancel
          </Button>
        </>
      )}
      <Badge
        variant={displayRun.status === 'completed' ? 'success' : 'secondary'}
      >
        {displayRun.status === 'completed' ? 'Completed' : 'In Progress'}
      </Badge>
      <div className="hidden min-w-[120px] xl:block">
        <div className="mb-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-success transition-all duration-300"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
        <div className="text-right text-sm font-medium">{displayProgress}%</div>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={isCreatingShare}
        onClick={() => void handleCreateShare()}
      >
        <Share2 className="mr-2 h-4 w-4" />
        {isCreatingShare ? 'Creating link...' : 'Share'}
      </Button>
    </>
  );
  const privateRunTitle = isEditingTitle ? (
    <Input
      value={editTitle}
      onChange={(event) => setEditTitle(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          void handleTitleSave();
        }
        if (event.key === 'Escape') {
          handleTitleCancel();
        }
      }}
      className="h-auto max-w-md border-none bg-transparent p-0 text-xl font-semibold focus-visible:ring-0"
      autoFocus
    />
  ) : (
    displayRun.title
  );
  const privateRunDescription = displayRun.templateOwner?.username
    ? `by @${displayRun.templateOwner.username}`
    : `${counts.completed} of ${counts.total} tasks finished`;
  const runHistoryEntries = (history?.data?.events ?? []).slice(0, 8);

  return (
    <div className="min-h-screen bg-background">
      {isSharedRun ? (
        <SEOHead
          title={displayRun.title}
          description={`Shared checklist run for ${displayRun.title}`}
          keywords={['shared checklist', 'checklist run']}
          robots="noindex, nofollow"
        />
      ) : null}

      {isSharedRun ? (
        <>
          <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <PageContainer
              className="flex h-14 items-center justify-between gap-4"
              width="narrow"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                  <ListChecks className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-medium text-foreground">
                    {displayRun.title}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Shared run snapshot
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCopyCurrentLink()}
                className="border-border"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy Link
              </Button>
            </PageContainer>
          </header>

          <main>
            <PageContainer className="py-8" width="narrow">
              <Surface className="mb-6" tone="glass">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Shared run snapshot
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-foreground">
                      {displayRun.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      A read-only checklist run that can be copied, reviewed,
                      and verified without dashboard access.
                    </p>
                  </div>
                  <div className="min-w-40 rounded-[var(--layout-card-radius)] border border-border bg-background p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Run progress
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-foreground">
                      {progress}%
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {counts.completed} of {counts.total} tasks
                    </p>
                  </div>
                </div>
                <Progress value={progress} className="mt-5 h-2" />
              </Surface>

              <div className="space-y-6">
              {sectionProgress.map(({ completed, section, total }) => (
                <Surface
                  as="section"
                  key={section.id}
                  className="overflow-hidden"
                  padding="none"
                >
                  <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="text-base font-semibold text-foreground">
                      {section.title}
                    </h2>
                    <span className="rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
                      {completed === total ? 'Complete' : `${completed}/${total}`}
                    </span>
                  </div>
                  <div className="space-y-3 p-4">
                    {section.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-[var(--layout-card-radius)] border border-border bg-background"
                      >
                        <div className="flex items-start gap-4 px-4 py-4">
                          <Checkbox
                            checked={item.isCompleted}
                            onCheckedChange={() => void handleItemToggle(item.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <h3
                              className={cn(
                                'font-medium text-foreground',
                                item.isCompleted &&
                                  'line-through text-muted-foreground',
                              )}
                            >
                              {item.title}
                            </h3>
                            {item.description ? (
                              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                                {normalizeDisplayText(item.description)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {item.contents && item.contents.length > 0 ? (
                          <div className="border-t border-border px-4 py-4">
                            <ContentRenderer
                              contents={item.contents}
                              disabled={false}
                              onSubItemToggle={(contentIndex, subItemIndex) =>
                                void handleSubItemToggle(
                                  item.id,
                                  contentIndex,
                                  subItemIndex,
                                )
                              }
                            />
                          </div>
                        ) : null}
                        <div className="border-t border-border px-4 py-4">
                          <RunNotesEditor
                            initialValue={item.notes}
                            label="Task notes"
                            onSave={(notes) => handleItemNotesSave(item.id, notes)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Surface>
              ))}

              <Surface as="section" className="text-center" tone="docs">
                <h3 className="text-lg font-medium text-foreground">
                  Want to run your own checklist?
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Browse public templates and start a fresh run from a template
                  that matches your workflow.
                </p>
                <Button
                  asChild
                  className="mt-4 bg-foreground text-background hover:bg-foreground/90"
                >
                  <Link to={buildPublicTemplatesPath()}>Browse Public Templates</Link>
                </Button>
              </Surface>
              </div>
            </PageContainer>
          </main>
        </>
      ) : (
        <DashboardContentShell>
          <DashboardPageHeader
            title={privateRunTitle}
            description={privateRunDescription}
            actions={privateRunHeaderActions}
          />
          <DashboardScrollArea className="p-0">
          <section
            className="border-b border-border bg-card px-4 py-4 sm:px-6 xl:hidden"
            data-mobile-run-progress="true"
          >
            <div className="mb-3 flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-foreground">
                  {displayProgress}% complete
                </p>
                <p className="text-xs text-muted-foreground">
                  {counts.completed} of {counts.total} tasks finished
                </p>
              </div>
              {selectedEntry ? (
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                  Task {selectedIndex + 1} of {flatItems.length}
                </span>
              ) : null}
            </div>
            <Progress value={displayProgress} className="h-2" />
          </section>

          <div
            className="grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1fr)_320px]"
            data-run-workspace-shell="true"
          >
            <main className="min-h-full min-w-0">
              {selectedEntry ? (
                <TaskExecutionPanel
                  section={selectedEntry.section}
                  task={selectedEntry.item}
                  taskIndex={selectedEntry.itemIndex}
                  totalTasks={selectedEntry.totalItemsInSection}
                  onNavigateNext={() => {
                    if (nextEntry) {
                      setSelectedItemId(nextEntry.item.id);
                    }
                  }}
                  onNavigatePrev={() => {
                    if (previousEntry) {
                      setSelectedItemId(previousEntry.item.id);
                    }
                  }}
                  onToggleSubItem={(contentIndex, subItemIndex) =>
                    void handleSubItemToggle(
                      selectedEntry.item.id,
                      contentIndex,
                      subItemIndex,
                    )
                  }
                  onToggleTask={() => void handleItemToggle(selectedEntry.item.id)}
                  onSaveNotes={(notes) =>
                    handleItemNotesSave(selectedEntry.item.id, notes)
                  }
                  hasNext={Boolean(nextEntry)}
                  hasPrev={Boolean(previousEntry)}
                />
              ) : (
                <div className="py-16 text-center text-muted-foreground">
                  Select a task to continue.
                </div>
              )}
              <section className="border-t border-border bg-background px-4 py-5 sm:px-6">
                <div className="mx-auto max-w-3xl">
                  <div className="mb-4 flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">
                      Changelog
                    </h2>
                  </div>
                  {history?.isLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading run history...
                    </p>
                  ) : history?.isError ? (
                    <p className="text-sm text-muted-foreground">
                      Run history is unavailable right now.
                    </p>
                  ) : runHistoryEntries.length > 0 ? (
                    <div className="divide-y divide-border rounded-lg border border-border bg-card">
                      {runHistoryEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {formatRunHistoryAction(entry.action)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getRunHistoryActorName(entry.actor)}
                            </p>
                          </div>
                          <time className="text-xs text-muted-foreground">
                            {formatRunHistoryTime(entry.createdAt)}
                          </time>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No run history has been recorded yet.
                    </p>
                  )}
                </div>
              </section>
            </main>
            <RunProgressPanel
              sections={displayRun.sections}
              currentSectionId={selectedEntry?.section.id ?? selectedData?.section.id ?? null}
              currentTaskId={activeItemId}
              onSelectTask={(_, taskId) => setSelectedItemId(taskId)}
            />
          </div>
          </DashboardScrollArea>
        </DashboardContentShell>
      )}

      <Dialog open={isCompleteDialogOpen} onOpenChange={setIsCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checklist Completed!</DialogTitle>
            <DialogDescription>
              Congratulations! You have completed all items in this checklist.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCompleteRun()}>
              <Check className="mr-2 h-4 w-4" />
              {isSharedRun ? 'Return to Public Runs' : 'Return to Dashboard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChecklistRunPage;
