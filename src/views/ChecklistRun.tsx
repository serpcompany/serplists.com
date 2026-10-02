'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle } from 'lucide-react';

import {
  DashboardContentShell,
  DashboardEmptyState,
  DashboardLoadingState,
  DashboardPageBody,
} from '@/components/dashboard/DashboardContentShell';
import { PageContainer } from '@/components/layout/page-shell';
import { RUN_SHARE_LINK_DESCRIPTION, ShareLinkDialog } from '@/components/shared/ShareLinkDialog';
import { Button } from '@/components/ui/button';
import { RunCompleteDialog } from '@/components/run-execution/RunCompleteDialog';
import { RunHistorySection } from '@/components/run-execution/RunHistorySection';
import { MobileRunProgress } from '@/components/run-execution/MobileRunProgress';
import { RetiredRunItems } from '@/components/run-execution/RetiredRunItems';
import { RunProgressPanel } from '@/components/run-execution/RunProgressSidebar';
import { RunPageHeader } from '@/components/run-execution/RunPageHeader';
import { SharedRunView } from '@/components/run-execution/SharedRunView';
import { TaskExecutionPanel } from '@/components/run-execution/TaskExecutionPanel';
import { WorkspaceErrorNotice } from '@/components/workspace/WorkspaceErrorNotice';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { canFinishRun, getPrimaryTaskAction } from '@/features/run-execution/primaryTaskAction';
import { useKeptRunNoteDrafts } from '@/features/run-execution/keptNoteDrafts';
import { RUN_NOTES_UNSAVED_MESSAGE } from '@/features/run-execution/noteDrafts';
import { useRunExecutionModel } from '@/features/run-execution/useRunExecutionModel';
import { useRunShareLink } from '@/features/run-execution/useRunShareLink';
import { usePageVisit } from '@/hooks/usePageVisit';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { useUnsavedChangesGuard } from '@/lib/navigation/useUnsavedChangesGuard';
import { isRunTitleChange } from '@/features/run-execution/runTitle';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
  buildConsoleHomePath,
  buildConsoleRunsPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { countRunTasks } from '@/lib/utils/checklistSections';
import { formatCount } from '@/lib/utils/pluralize';

const ChecklistRunPage = () => {
  const { id, shareToken } = useParams<{ id?: string; shareToken?: string }>();
  const router = useAppRouter();
  const beginVisit = usePageVisit();
  const { updateRun } = useTemplates();
  const { getPermissions, isRoleUnavailable, retryWorkspace } = useWorkspace();
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isCompletingRun, setIsCompletingRun] = useState(false);
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
    runId: id,
    shareToken,
    updateRun,
  });
  const displayRun = run;
  const displayProgress = displayRun?.progress ?? progress;
  const shareLinkState = useRunShareLink(displayRun?.id, { createShare, stopSharing }, displayRun?.isPublic === true);
  const keepNoteDrafts = useKeptRunNoteDrafts({ privateRun: isSharedRun ? null : run, noteDrafts, restoreNoteDrafts });
  const { allowLeave } = useUnsavedChangesGuard(hasUnsavedNotes, RUN_NOTES_UNSAVED_MESSAGE, keepNoteDrafts);

  useEffect(() => {
    if (!notFound || loading) {
      return;
    }

    toast.error('Run not found');
    allowLeave();
    router.replace(isSharedRun ? buildPublicTemplatesPath() : buildConsoleHomePath());
  }, [allowLeave, isSharedRun, loading, notFound, router]);

  useEffect(() => {
    if (!loadError) {
      return;
    }

    toast.error(loadError);
  }, [loadError]);

  const handleBack = () =>
    router.push(isSharedRun ? buildPublicTemplatesPath() : buildConsoleRunsPath());

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
    if (await copyTextToClipboard(window.location.href)) toast.success('Link copied to clipboard');
    else toast.error("Couldn't copy the link. Copy it from the address bar.");
  };

  const handleCompleteRun = async () => {
    const visit = beginVisit();
    setIsCompletingRun(true);
    const result = await completeRun().finally(() => setIsCompletingRun(false));

    if (result.kind === 'ok') {
      setIsCompleteDialogOpen(false);
      toast.success('Run completed');
      if (!isSharedRun && visit.isCurrent()) {
        router.push(buildConsoleRunsPath());
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
          <DashboardLoadingState />
        </DashboardContentShell>
      );
    }

    return (
      <PageContainer width="narrow">
        <DashboardLoadingState />
      </PageContainer>
    );
  }

  if (!displayRun) {
    const missingRun = (
      <DashboardEmptyState
        icon={<AlertCircle />}
        title={loadError ? 'Unable to load run' : 'Run not found'}
        titleAs="h1"
        description={loadError ?? ''}
        action={<Button onClick={handleBack}>Back</Button>}
      />
    );

    return isSharedRun ? (
      <PageContainer className="py-8" width="narrow">
        {missingRun}
      </PageContainer>
    ) : (
      <DashboardContentShell>{missingRun}</DashboardContentShell>
    );
  }

  const canUpdateRun = isSharedRun || getPermissions(displayRun.teamId).canRun;
  const roleUnavailable = !isSharedRun && isRoleUnavailable(displayRun.teamId);
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
  const finishRunButton = canUpdateRun && canFinishRun(displayRun) ? (
    <Button onClick={() => setIsCompleteDialogOpen(true)}>
      <CheckCircle data-icon="inline-start" />
      Complete run
    </Button>
  ) : null;
  const privateRunDescription = `${counts.tasksCompleted} of ${formatCount(counts.tasksTotal, 'task')} finished`;

  return (
    <>
      {isSharedRun ? (
        <SharedRunView
          completedTasks={counts.tasksCompleted}
          finishRunButton={finishRunButton}
          isRunCompleted={isRunCompleted}
          noteDrafts={noteDrafts}
          onCopyLink={() => void handleCopyCurrentLink()}
          onNoteDraftChange={setNoteDraft}
          onSaveNotes={handleItemNotesSave}
          onToggleSubItem={(itemId, contentIndex, subItemIndex, isCompleted) =>
            void handleSubItemToggle(itemId, contentIndex, subItemIndex, isCompleted)
          }
          onToggleTask={(itemId, isCompleted) => void handleItemToggle(itemId, isCompleted)}
          progress={progress}
          run={displayRun}
          sectionProgress={sectionProgress}
          totalTasks={counts.tasksTotal}
        />
      ) : (
        <DashboardContentShell className="overflow-clip">
          <RunPageHeader
            canUpdateRun={canUpdateRun}
            description={privateRunDescription}
            editTitle={editTitle}
            finishRunButton={finishRunButton}
            isCompleted={isRunCompleted}
            isCreatingShare={shareLinkState.isCreatingShare}
            isEditingTitle={isEditingTitle}
            isPublic={displayRun.isPublic === true}
            onBack={handleBack}
            onCancelRename={handleTitleCancel}
            onEditTitleChange={setEditTitle}
            onSaveTitle={() => void handleTitleSave()}
            onShare={() => void shareLinkState.createShareLink()}
            onStartRename={handleTitleEdit}
            onStopSharing={shareLinkState.stopSharing}
            progress={displayProgress}
            roleUnavailable={roleUnavailable}
            title={displayRun.title}
            titleChanged={isRunTitleChange(editTitle, displayRun.title)}
          />
          <DashboardPageBody className="overflow-clip">
            {roleUnavailable ? (
              <WorkspaceErrorNotice id="run-workspace-error" message="This run's actions wait until they load. Check your connection and try again." onRetry={retryWorkspace} />
            ) : null}
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
              className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"
              data-run-workspace-shell="true"
            >
              <main className="flex min-w-0 flex-col gap-6">
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
                  <p className="py-16 text-center text-muted-foreground">
                    Select a task to continue.
                  </p>
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
          </DashboardPageBody>
        </DashboardContentShell>
      )}

      <ShareLinkDialog
        copiedMessage="Share link copied to clipboard"
        description={RUN_SHARE_LINK_DESCRIPTION}
        onOpenChange={shareLinkState.setIsShareDialogOpen}
        open={shareLinkState.isShareDialogOpen}
        title="Share run"
        url={shareLinkState.shareUrl}
      />

      <RunCompleteDialog
        completing={isCompletingRun}
        onComplete={() => void handleCompleteRun()}
        onOpenChange={setIsCompleteDialogOpen}
        open={isCompleteDialogOpen}
      />
    </>
  );
};

export default ChecklistRunPage;
