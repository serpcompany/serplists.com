import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle,
  Copy,
  Edit2,
  Loader2,
  ListChecks,
} from 'lucide-react';

import { PageContainer, Surface } from '@/components/layout/page-shell';
import {
  DashboardContentShell,
  DashboardPageHeader,
  DashboardScrollArea,
} from '@/components/dashboard/DashboardContentShell';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { ShareLinkDialog } from '@/components/shared/ShareLinkDialog';
import { SEOHead } from '@/components/shared/SEOHead';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RunCompleteDialog } from '@/components/run-execution/RunCompleteDialog';
import { RunHistorySection } from '@/components/run-execution/RunHistorySection';
import { MobileRunProgress } from '@/components/run-execution/MobileRunProgress';
import { RetiredRunItems } from '@/components/run-execution/RetiredRunItems';
import { RunProgressPanel } from '@/components/run-execution/RunProgressSidebar';
import { RunShareActions } from '@/components/run-execution/RunShareActions';
import { TaskExecutionPanel } from '@/components/run-execution/TaskExecutionPanel';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { canFinishRun, getPrimaryTaskAction } from '@/features/run-execution/primaryTaskAction';
import { useKeptRunNoteDrafts } from '@/features/run-execution/keptNoteDrafts';
import { RUN_NOTES_UNSAVED_MESSAGE } from '@/features/run-execution/noteDrafts';
import { getTaskCheckboxLabel } from '@/features/run-execution/taskCheckboxLabel';
import { useRunExecutionModel } from '@/features/run-execution/useRunExecutionModel';
import { useRunShareLink } from '@/features/run-execution/useRunShareLink';
import { usePageVisit } from '@/hooks/usePageVisit';
import { useUnsavedChangesGuard } from '@/lib/navigation/useUnsavedChangesGuard';
import { isRunTitleChange } from '@/features/run-execution/runTitle';
import { cn } from '@/lib/utils';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
  buildConsoleHomePath,
  buildConsoleRunsPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { RUN_TITLE_MAX } from '@/lib/schemas/nameLimits';
import { countRunTasks, getSectionDisplayTitle } from '@/lib/utils/checklistSections';
import { onSingleClick } from '@/lib/utils/repeatClick';
import { RunNotesEditor } from '@/components/run-execution/RunNotesEditor';

const ChecklistRunPage = () => {
  const { id, shareToken } = useParams<{ id?: string; shareToken?: string }>();
  const navigate = useNavigate();
  // Completing awaits the save; it leaves for the list only if the user is still here.
  const beginVisit = usePageVisit();
  const { updateRun } = useTemplates();
  const { getPermissions } = useWorkspace();
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const {
    counts,
    createShare,
    hasUnsavedNotes,
    history,
    isSharedRun,
    loadError,
    loading,
    notFound,
    noteDrafts,
    progress,
    restoreNoteDrafts,
    run,
    saveItemNotes,
    setNoteDraft,
    saveTitle,
    selectedData,
    selectedItemId,
    setSelectedItemId,
    stopSharing,
    completeRun,
    toggleItem,
    toggleSubItem,
  } = useRunExecutionModel({
    // No getCachedRun: the run list loads only on the runs dashboard and is not refreshed
    // after this page saves, so the page always loads its own run by id.
    runId: id,
    shareToken,
    updateRun,
  });
  const displayRun = run;
  const displayProgress = displayRun?.progress ?? progress;
  const shareLinkState = useRunShareLink(displayRun?.id, { createShare, stopSharing });
  const keepNoteDrafts = useKeptRunNoteDrafts({ run: isSharedRun ? null : run, noteDrafts, restoreNoteDrafts });
  // Every way out of the page asks once while task notes are unsaved: its own Runs and
  // Back buttons, the app shell, browser Back/Forward, Sign out, and a reload or tab close.
  const { allowLeave } = useUnsavedChangesGuard(hasUnsavedNotes, RUN_NOTES_UNSAVED_MESSAGE, keepNoteDrafts);

  useEffect(() => {
    if (!notFound || loading) {
      return;
    }

    toast.error('Run not found');
    // The run is gone (deleted elsewhere, even during a save), so its notes cannot be saved.
    allowLeave();
    navigate(
      isSharedRun ? buildPublicTemplatesPath() : buildConsoleHomePath(),
      { replace: true },
    );
  }, [allowLeave, isSharedRun, loading, navigate, notFound]);

  useEffect(() => {
    if (!loadError) {
      return;
    }

    toast.error(loadError);
  }, [loadError]);

  const leaveRun = () =>
    navigate(isSharedRun ? buildPublicTemplatesPath() : buildConsoleRunsPath());
  const handleBack = leaveRun;

  // isCompleted is the value the user clicked on the run they saw (set, not flipped).
  const handleItemToggle = async (itemId: string, isCompleted: boolean) => {
    const result = await toggleItem(itemId, isCompleted);

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
    isCompleted: boolean,
  ) => {
    const result = await toggleSubItem(itemId, contentIndex, subItemIndex, isCompleted);

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
    if (result.kind === 'ignored') return false;
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
    // Enter on an untouched title closes the editor without a save or a toast.
    if (editTitle.trim() === run.title) {
      handleTitleCancel();
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

  const handleCopyCurrentLink = async () => {
    if (typeof window === 'undefined') return;
    if (await copyTextToClipboard(window.location.href)) toast.success('Link copied to clipboard');
    else toast.error("Couldn't copy the link. Copy it from the address bar.");
  };

  const handleCompleteRun = async () => {
    const visit = beginVisit();
    const result = await completeRun();

    if (result.kind === 'ok') {
      setIsCompleteDialogOpen(false);
      toast.success('Checklist completed! 🎉');
      // Only from this run: after Back or another run, it must not pull the user away.
      // Completion saved every note draft, so the leave guard lets this through without
      // asking. A note typed while the completion was saving still asks.
      if (visit.isCurrent()) {
        leaveRun();
      }
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

  // Share links govern shared runs; private runs follow the role in the run's Organization.
  const canUpdateRun = isSharedRun || getPermissions(displayRun.teamId).canRun;
  // Completed runs are frozen: their tasks can no longer be ticked or unticked.
  const isRunCompleted = displayRun.status === 'completed';
  const activeItemId = selectedItemId ?? displayRun.sections[0]?.items[0]?.id ?? null;
  const flatItems = displayRun.sections.flatMap((section, sectionIndex) =>
    section.items.map((item, itemIndex) => ({
      item,
      itemIndex,
      section,
      sectionIndex,
      totalItemsInSection: section.items.length,
    })),
  );
  const selectedIndex = flatItems.findIndex(
    (entry) => entry.item.id === activeItemId,
  );
  const selectedEntry = selectedIndex >= 0 ? flatItems[selectedIndex] : null;
  const currentSectionId = selectedEntry?.section.id ?? selectedData?.section.id ?? null;
  const previousEntry = selectedIndex > 0 ? flatItems[selectedIndex - 1] : null;
  const nextEntry =
    selectedIndex >= 0 && selectedIndex < flatItems.length - 1
      ? flatItems[selectedIndex + 1]
      : null;

  const sectionProgress = displayRun.sections.map((section, index) => {
    const { tasksCompleted, tasksTotal } = countRunTasks([section]);
    return { completed: tasksCompleted, index, total: tasksTotal, section };
  });
  // Stays available after the completion dialog is dismissed, a reload, or MCP ticks.
  const finishRunButton = canUpdateRun && canFinishRun(displayRun) ? (
    <Button size="sm" onClick={() => setIsCompleteDialogOpen(true)}>
      <CheckCircle className="mr-2 h-4 w-4" />
      Complete run
    </Button>
  ) : null;
  const privateRunHeaderActions = (
    <>
      <Button variant="ghost" size="sm" onClick={handleBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Runs
      </Button>
      {/* Save title and Cancel take Rename's place, so the second click of a double
          click on any of them is ignored. */}
      {!canUpdateRun ? null : !isEditingTitle ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={onSingleClick(handleTitleEdit)}
        >
          <Edit2 className="mr-2 h-4 w-4" />
          Rename
        </Button>
      ) : (
        <>
          <Button
            size="sm"
            disabled={!isRunTitleChange(editTitle, displayRun.title)}
            onClick={onSingleClick(() => void handleTitleSave())}
          >
            Save title
          </Button>
          <Button size="sm" variant="outline" onClick={onSingleClick(handleTitleCancel)}>
            Cancel
          </Button>
        </>
      )}
      <Badge
        variant={displayRun.status === 'completed' ? 'success' : 'secondary'}
      >
        {displayRun.status === 'completed' ? 'Completed' : 'In Progress'}
      </Badge>
      {canUpdateRun ? null : <Badge variant="secondary">View only</Badge>}
      {finishRunButton}
      <div className="hidden min-w-[120px] xl:block">
        <div className="mb-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-success transition-all duration-300"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
        <div className="text-right text-sm font-medium">{displayProgress}%</div>
      </div>
      {canUpdateRun ? (
        <RunShareActions
          isCreatingShare={shareLinkState.isCreatingShare}
          isPublic={displayRun.isPublic === true}
          onShare={() => void shareLinkState.createShareLink()}
          onStopSharing={shareLinkState.stopSharing}
        />
      ) : null}
    </>
  );
  const privateRunTitle = isEditingTitle ? (
    <Input
      aria-label="Run title"
      maxLength={RUN_TITLE_MAX}
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
  // Tasks only, like the task list and "Task N of M"; the percentage also weights sub-tasks.
  const privateRunDescription = `${counts.tasksCompleted} of ${counts.tasksTotal} tasks finished`;

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
                      {counts.tasksCompleted} of {counts.tasksTotal} tasks
                    </p>
                  </div>
                </div>
                <Progress value={progress} className="mt-5 h-2" />
                {finishRunButton ? <div className="mt-5">{finishRunButton}</div> : null}
              </Surface>

              <div className="space-y-6">
              {sectionProgress.map(({ completed, index, section, total }) => (
                <Surface
                  as="section"
                  key={section.id}
                  className="overflow-hidden"
                  padding="none"
                >
                  <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="text-base font-semibold text-foreground">
                      {getSectionDisplayTitle(section, index)}
                    </h2>
                    <span className="rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
                      {completed === total ? 'Complete' : `${completed}/${total}`}
                    </span>
                  </div>
                  <div className="space-y-3 p-4">
                    {section.items.map((item, itemIndex) => (
                      <div
                        key={item.id}
                        className="rounded-[var(--layout-card-radius)] border border-border bg-background"
                      >
                        <div className="flex items-start gap-4 px-4 py-4">
                          <Checkbox
                            aria-label={getTaskCheckboxLabel(item.title, itemIndex + 1)}
                            checked={item.isCompleted}
                            disabled={isRunCompleted}
                            onCheckedChange={(checked) => void handleItemToggle(item.id, checked === true)}
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
                                {item.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {item.contents && item.contents.length > 0 ? (
                          <div className="border-t border-border px-4 py-4">
                            <ContentRenderer
                              contents={item.contents}
                              disabled={isRunCompleted}
                              onSubItemToggle={(contentIndex, subItemIndex, isCompleted) =>
                                void handleSubItemToggle(item.id, contentIndex, subItemIndex, isCompleted)
                              }
                            />
                          </div>
                        ) : null}
                        <div className="border-t border-border px-4 py-4">
                          <RunNotesEditor
                            draft={noteDrafts[item.id]}
                            label="Task notes"
                            onDraftChange={(notes) => setNoteDraft(item.id, notes)}
                            onSave={(notes) => handleItemNotesSave(item.id, notes)}
                            savedValue={item.notes}
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
          <MobileRunProgress
            completedTasks={counts.tasksCompleted}
            currentSectionId={currentSectionId}
            currentTaskId={activeItemId}
            onSelectTask={(_, taskId) => setSelectedItemId(taskId)}
            position={selectedEntry ? { index: selectedIndex, total: flatItems.length } : null}
            progress={displayProgress}
            sections={displayRun.sections}
            totalTasks={counts.tasksTotal}
          />

          <div
            className="grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1fr)_320px]"
            data-run-workspace-shell="true"
          >
            <main className="min-h-full min-w-0">
              {selectedEntry ? (
                <TaskExecutionPanel
                  section={selectedEntry.section}
                  sectionIndex={selectedEntry.sectionIndex}
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
                  onToggleSubItem={(contentIndex, subItemIndex, isCompleted) =>
                    void handleSubItemToggle(selectedEntry.item.id, contentIndex, subItemIndex, isCompleted)
                  }
                  onToggleTask={(isCompleted) => void handleItemToggle(selectedEntry.item.id, isCompleted)}
                  notesDraft={noteDrafts[selectedEntry.item.id]}
                  onNotesDraftChange={(notes) => setNoteDraft(selectedEntry.item.id, notes)}
                  onSaveNotes={(notes) =>
                    handleItemNotesSave(selectedEntry.item.id, notes)
                  }
                  hasNext={Boolean(nextEntry)}
                  hasPrev={Boolean(previousEntry)}
                  primaryAction={getPrimaryTaskAction(displayRun, selectedEntry.item.id, Boolean(nextEntry), canUpdateRun)}
                  readOnly={!canUpdateRun}
                  runCompleted={isRunCompleted}
                  onFinishRun={() => setIsCompleteDialogOpen(true)}
                  onSelectTask={setSelectedItemId}
                />
              ) : (
                <div className="py-16 text-center text-muted-foreground">
                  Select a task to continue.
                </div>
              )}
              <RetiredRunItems items={displayRun.retiredItems ?? []} />
              <RunHistorySection history={history} />
            </main>
            <RunProgressPanel
              progress={displayProgress}
              sections={displayRun.sections}
              currentSectionId={currentSectionId}
              currentTaskId={activeItemId}
              onSelectTask={(_, taskId) => setSelectedItemId(taskId)}
            />
          </div>
          </DashboardScrollArea>
        </DashboardContentShell>
      )}

      <ShareLinkDialog
        copiedMessage="Share link copied to clipboard"
        description="Anyone with this link can open this run without signing in."
        onOpenChange={shareLinkState.setIsShareDialogOpen}
        open={shareLinkState.isShareDialogOpen}
        title="Share run"
        url={shareLinkState.shareUrl}
      />

      <RunCompleteDialog
        isSharedRun={isSharedRun}
        onComplete={() => void handleCompleteRun()}
        onOpenChange={setIsCompleteDialogOpen}
        open={isCompleteDialogOpen}
      />
    </div>
  );
};

export default ChecklistRunPage;
