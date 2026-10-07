'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';

import {
  DashboardContentShell,
  DashboardEmptyState,
  DashboardLoadingState,
} from '@/components/dashboard/DashboardContentShell';
import { PageContainer } from '@/components/layout/page-shell';
import { RUN_SHARE_LINK_DESCRIPTION } from '@/components/shared/runShareLinkDescription';
import { ShareLinkDialog } from '@/components/shared/ShareLinkDialog';
import { Button } from '@/components/ui/button';
import { CompleteRunButton } from '@/components/run-execution/CompleteRunButton';
import { RunCompleteDialog } from '@/components/run-execution/RunCompleteDialog';
import { RunHistorySection } from '@/components/run-execution/RunHistorySection';
import { RetiredRunItems } from '@/components/run-execution/RetiredRunItems';
import { RunAnswersExportMenu } from '@/components/run-execution/RunAnswersExportMenu';
import { RunPageHeader } from '@/components/run-execution/RunPageHeader';
import { RunProvenancePanel } from '@/components/run-execution/RunProvenancePanel';
import { RunWorkspace } from '@/components/run-execution/RunWorkspace';
import { RequiredToolsList } from '@/components/template/RequiredToolsList';
import { SharedRunView } from '@/components/run-execution/SharedRunView';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { canFinishRun } from '@/features/run-execution/primaryTaskAction';
import { useKeptRunNoteDrafts } from '@/features/run-execution/keptNoteDrafts';
import { RUN_NOTES_UNSAVED_MESSAGE } from '@/features/run-execution/noteDrafts';
import { describeRunTaskCounts } from '@/features/run-execution/runExecutionMappers';
import { useRunExecutionModel } from '@/features/run-execution/useRunExecutionModel';
import { useRunPageActions } from '@/features/run-execution/useRunPageActions';
import { useRunShareLink } from '@/features/run-execution/useRunShareLink';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { useOwnerContextRedirect } from '@/lib/navigation/useOwnerContextRedirect';
import { useUnsavedChangesGuard } from '@/lib/navigation/useUnsavedChangesGuard';
import { isRunTitleChange } from '@/features/run-execution/runTitle';
import { copyTextToClipboard } from '@/lib/clipboard';
import { ownerConsoleContext } from '@/lib/consoleRoutes';
import {
  buildConsoleHomePath,
  buildConsoleRunsPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { countRunTasks } from '@/lib/utils/checklistSections';

const ChecklistRunPage = () => {
  const { id, shareToken } = useParams<{ id?: string; shareToken?: string }>();
  const router = useAppRouter();
  const { updateRun } = useTemplates();
  const { consoleContext, getPermissions } = useWorkspace();
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
    saveFormAnswer,
    saveItemNotes,
    setNoteDraft,
    saveTitle,
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
  const runContext = displayRun ? ownerConsoleContext(displayRun.teamId) : consoleContext;
  const isMovingToOwner = useOwnerContextRedirect(isSharedRun ? null : runContext);
  const consoleHomePath = buildConsoleHomePath(consoleContext);
  const displayProgress = displayRun?.progress ?? progress;
  const shareLinkState = useRunShareLink(displayRun?.id, { createShare, stopSharing }, displayRun?.isPublic === true);
  const keepNoteDrafts = useKeptRunNoteDrafts({ privateRun: isSharedRun ? null : run, noteDrafts, restoreNoteDrafts });
  const { allowLeave } = useUnsavedChangesGuard(hasUnsavedNotes, RUN_NOTES_UNSAVED_MESSAGE, keepNoteDrafts);
  const actions = useRunPageActions({ completeRun, saveFormAnswer, saveItemNotes, toggleItem, toggleSubItem }, (visit) => {
    if (!isSharedRun && visit.isCurrent()) {
      router.push(buildConsoleRunsPath(runContext));
    }
  });

  useEffect(() => {
    if (!notFound || loading) {
      return;
    }

    toast.error('Run not found');
    allowLeave();
    router.replace(isSharedRun ? buildPublicTemplatesPath() : consoleHomePath);
  }, [allowLeave, consoleHomePath, isSharedRun, loading, notFound, router]);

  useEffect(() => {
    if (!loadError) {
      return;
    }

    toast.error(loadError);
  }, [loadError]);

  const handleBack = () =>
    router.push(isSharedRun ? buildPublicTemplatesPath() : buildConsoleRunsPath(runContext));

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

  if (loading || isMovingToOwner) {
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
  const isRunCompleted = displayRun.status === 'completed';

  const sectionProgress = displayRun.sections.map((section, index) => {
    const { tasksCompleted, tasksTotal } = countRunTasks([section]);
    return { completed: tasksCompleted, index, total: tasksTotal, section };
  });
  const finishRunButton = canUpdateRun && canFinishRun(displayRun) ? (
    <CompleteRunButton onClick={actions.openCompleteDialog} />
  ) : null;

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
          onSaveNotes={actions.saveNotes}
          onToggleSubItem={actions.toggleSubItem}
          onToggleTask={actions.toggleTask}
          progress={progress}
          run={displayRun}
          sectionProgress={sectionProgress}
          totalTasks={counts.tasksTotal}
        />
      ) : (
        <DashboardContentShell className="overflow-clip">
          <RunPageHeader
            answersExport={<RunAnswersExportMenu run={displayRun} />}
            canUpdateRun={canUpdateRun}
            description={describeRunTaskCounts(counts)}
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
            title={displayRun.title}
            titleChanged={isRunTitleChange(editTitle, displayRun.title)}
          />
          <RunProvenancePanel run={displayRun} />
          <RequiredToolsList compact tools={displayRun.provenance?.template?.requiredTools} />
          <RunWorkspace
            canUpdateRun={canUpdateRun}
            completedTasks={counts.tasksCompleted}
            formAttempt={actions.formAttempt}
            noteDrafts={noteDrafts}
            onFinishRun={actions.openCompleteDialog}
            onFormAnswerChange={actions.saveFormAnswer}
            onNoteDraftChange={setNoteDraft}
            onSaveNotes={actions.saveNotes}
            onSelectTask={setSelectedItemId}
            onToggleSubItem={actions.toggleSubItem}
            onToggleTask={actions.toggleTask}
            progress={displayProgress}
            run={displayRun}
            selectedItemId={selectedItemId}
            totalTasks={counts.tasksTotal}
          >
            <RetiredRunItems items={displayRun.retiredItems ?? []} />
            <RunHistorySection history={history} />
          </RunWorkspace>
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

      <RunCompleteDialog {...actions.completeDialog} />
    </>
  );
};

export default ChecklistRunPage;
